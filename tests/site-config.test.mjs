import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (name) => readFileSync(join(repoRoot, name), "utf8");
// holocron.jsonc has no comments today; strip whole-line // comments in case some are added.
const site = JSON.parse(read("holocron.jsonc").replace(/^\s*\/\/.*$/gm, ""));
const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));

const STARTER_HOSTS = /(^|\/\/)(www\.)?(holocron\.so|github\.com\/remorses|x\.com\/__morse)(\/|$)/;

function siteLinks() {
  return [
    ...site.navbar.links.map((l) => l.href),
    site.navbar.primary?.href,
    ...site.footer.links.flatMap((g) => g.items.map((i) => i.href)),
    ...Object.values(site.footer.socials ?? {}),
  ].filter(Boolean);
}

test("navbar, footer and socials no longer point at the Holocron starter defaults", () => {
  const links = siteLinks();
  assert.ok(links.length > 0);
  for (const href of links) assert.doesNotMatch(href, STARTER_HOSTS, href);
});

test("root-relative site links resolve to a docs page or folder", () => {
  for (const href of siteLinks().filter((h) => h.startsWith("/"))) {
    const rel = href.slice(1).replace(/\/$/, "");
    assert.ok(
      existsSync(join(repoRoot, `${rel}.mdx`)) || existsSync(join(repoRoot, rel, "meta.json")),
      `${href} does not resolve`,
    );
  }
});

test("package metadata is filled in", () => {
  assert.notEqual(pkg.description, "Repository created using Holocron");
  assert.ok(pkg.description?.trim());
  assert.ok(String(pkg.author ?? "").trim(), "author is empty");
});

test("license field matches the repository", () => {
  if (pkg.license === "UNLICENSED") {
    assert.equal(pkg.private, true, "UNLICENSED packages should be private");
  } else {
    assert.ok(existsSync(join(repoRoot, "LICENSE")), `license ${pkg.license} but no LICENSE file`);
  }
  assert.equal(lock.packages[""].license, pkg.license, "package-lock.json license is stale");
});
