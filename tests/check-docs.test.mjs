import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkDocs, scalarValue } from "../scripts/check-docs.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const script = join(repoRoot, "scripts", "check-docs.mjs");

const page = (title = "'T'", extra = "") =>
  `---\ntitle: ${title}\ndescription: 'D'\nicon: 'i'\n${extra}---\n\n# Body\n`;

const fixtures = [];
after(() => fixtures.forEach((d) => rmSync(d, { recursive: true, force: true })));

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "check-docs-"));
  fixtures.push(dir);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

test("this repository passes", () => {
  assert.deepEqual(checkDocs(repoRoot).errors, []);
});

test("valid fixture with rest marker, separator, link and folder passes", () => {
  const dir = fixture({
    "docs/a.mdx": page(),
    "docs/sub/b.mdx": page(),
    "docs/meta.json": JSON.stringify({ pages: ["a", "!a", "sub", "---Sep---", "[X](https://x.y)", "...", "z...a"] }),
  });
  assert.deepEqual(checkDocs(dir).errors, []);
});

test("missing icon is reported", () => {
  const dir = fixture({ "a.mdx": "---\ntitle: T\ndescription: D\n---\n" });
  const { errors } = checkDocs(dir);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /icon/);
});

test("missing frontmatter is reported", () => {
  const dir = fixture({ "a.mdx": "# no frontmatter\n" });
  assert.match(checkDocs(dir).errors.join("\n"), /missing frontmatter/);
});

for (const value of ["null", "~", "# TODO", '"" # TODO', "''", '"  "']) {
  test(`empty title ${JSON.stringify(value)} is reported`, () => {
    const dir = fixture({ "a.mdx": page(value) });
    assert.match(checkDocs(dir).errors.join("\n"), /missing frontmatter field title/);
  });
}

for (const value of ["!!null", "!!str null", "!<tag:yaml.org,2002:null>", "!!str |", "&a", "&a Title", "*a", "|", ">-", "|\n  Block title\n", '"Hello', "'Hello", '"multi\n  line"', "Bad\ntitle: Good", "&a Bad\ntitle: Good", "[a, b]", "{x: y}"]) {
  test(`unsupported YAML title ${JSON.stringify(value)} is rejected`, () => {
    const dir = fixture({ "a.mdx": page(value) });
    assert.match(checkDocs(dir).errors.join("\n"), /field title must be a plain or quoted/);
  });
}

test("unparseable top-level frontmatter lines are rejected", () => {
  for (const extra of ["? title\n", "[a, b]\n", "title:Bad\n", '"title": B\n', "'title': B\n", '"ti\\u0074le": B\n', "!!str title: B\n", '" title ": B\n', "orphan # comment: Stuff\n", "[a, b: Stuff\n", "og:image: x\n", "title : B\n", "title\t: B\n"]) {
    const dir = fixture({ "a.mdx": page("'T'", extra) });
    assert.match(checkDocs(dir).errors.join("\n"), /unsupported frontmatter line|field title must be/, extra);
  }
});

test("nested and list frontmatter is allowed", () => {
  const dir = fixture({ "a.mdx": page("'T'", "tags:\n  - a\n  - b\n# comment\nsidebar_label: x\nnested:\n  key: y\n") });
  assert.deepEqual(checkDocs(dir).errors, []);
});

test("real values pass", () => {
  assert.deepEqual(scalarValue(`"Rules" # ok`), { value: "Rules" });
  assert.deepEqual(scalarValue(`'It''s'`), { value: "It''s" });
  assert.deepEqual(scalarValue("C# Guide"), { value: "C# Guide" });
  assert.deepEqual(scalarValue("'null'"), { value: "null" });
  const dir = fixture({ "a.mdx": page("Plain title") });
  assert.deepEqual(checkDocs(dir).errors, []);
});

test("meta.json page without a file is reported", () => {
  const dir = fixture({ "a.mdx": page(), "meta.json": JSON.stringify({ pages: ["a", "missing-page"] }) });
  assert.match(checkDocs(dir).errors.join("\n"), /missing-page/);
});

test("malformed rest markers and path-like entries are rejected", () => {
  const dir = fixture({
    "a.mdx": page(),
    "sub/b.mdx": page(),
    "meta.json": JSON.stringify({ pages: ["z...", "...a", "!", ".", "..", "../a", "sub/b", "/a"] }),
  });
  assert.equal(checkDocs(dir).errors.length, 8);
});

test("invalid meta.json is reported", () => {
  const dir = fixture({ "a.mdx": page(), "meta.json": "{nope" });
  assert.match(checkDocs(dir).errors.join("\n"), /invalid JSON/);
});

test("node_modules anywhere and root build/hidden dirs are skipped", () => {
  const dir = fixture({
    "a.mdx": page(),
    "node_modules/x/b.mdx": "bad",
    "docs/node_modules/x/b.mdx": "bad",
    ".cache/c.mdx": "bad",
    "build/d.mdx": "bad",
  });
  assert.deepEqual(checkDocs(dir).errors, []);
});

test("nested build/ and hidden content dirs are still checked", () => {
  const dir = fixture({ "a.mdx": page(), "guides/build/p.mdx": "bad", "guides/.content/q.mdx": "bad" });
  assert.equal(checkDocs(dir).errors.length, 2);
});

test("CLI exits 1 on broken docs and 0 on valid docs", () => {
  const broken = fixture({ "a.mdx": "bad" });
  const valid = fixture({ "a.mdx": page() });
  assert.equal(spawnSync(process.execPath, [script, broken]).status, 1);
  assert.equal(spawnSync(process.execPath, [script, valid]).status, 0);
});

const hasGitWorktree =
  spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: repoRoot }).stdout?.toString().trim() === "true";

test(".gitignore ignores build output only at the root", { skip: !hasGitWorktree && "needs git and a git checkout" }, () => {
  const ignored = (p) => spawnSync("git", ["check-ignore", "-q", p], { cwd: repoRoot }).status === 0;
  for (const p of ["node_modules/x/i.js", "docs/node_modules/x", ".DS_Store", "docs/.DS_Store", "build/x", "dist/x", "out/x", ".cache/x"]) {
    assert.ok(ignored(p), `${p} should be ignored`);
  }
  for (const p of ["guides/build/p.mdx", "guides/dist/p.mdx", "guides/out/p.mdx"]) {
    assert.ok(!ignored(p), `${p} should not be ignored`);
  }
});

test("broken internal links in .mdx are reported", () => {
  const dir = fixture({
    "docs/a.mdx": page("'T'", "") +
      '<Card href="/docs/gone">x</Card>\n[md](/docs/renamed)\n[rel](./nope)\n![img](/img/missing.png)\n<Card href={"/docs/also-gone"}>y</Card>\n',
  });
  const { errors } = checkDocs(dir);
  assert.equal(errors.length, 5, errors.join("\n"));
  for (const t of ["/docs/gone", "/docs/renamed", "./nope", "/img/missing.png", "/docs/also-gone"]) {
    assert.match(errors.join("\n"), new RegExp(`broken link "${t.replace(/[./]/g, "\\$&")}"`));
  }
  assert.match(errors[0], /^docs\/a\.mdx:8: broken link "\/docs\/gone"/);
});

test("valid internal links, external links and links in code pass", () => {
  const dir = fixture({
    "docs/a.mdx": page() +
      '<Card href="/docs/b#section">x</Card>\n[b](./b) [b2](b.mdx) [sub](/docs/sub) [root](/) [anchor](#top)\n' +
      "[ext](https://example.com/x) [mail](mailto:a@b.c) [proto](//cdn.example.com/x)\n" +
      "![logo](/logo.svg) ![pub](/pub.png) [q](/docs/b?x=1)\n" +
      "`[inline](/nope)`\n```md\n[fenced](/nope)\n<a href=\"/nope\">\n```\n~~~~\n[tilde](/nope)\n~~~\nstill fenced](/nope)\n~~~~\n",
    "docs/b.mdx": page(),
    "docs/sub/index.mdx": page(),
    "logo.svg": "<svg/>",
    "public/pub.png": "x",
  });
  assert.deepEqual(checkDocs(dir).errors, []);
});

test("reference definitions, template-literal hrefs and parens in destinations", () => {
  const bad = fixture({
    "a.mdx": page() + "[guide][g]\n\n[g]: /removed-page\n<Card href={`/also-removed`}>x</Card>\n",
  });
  const errors = checkDocs(bad).errors.join("\n");
  assert.match(errors, /broken link "\/removed-page"/);
  assert.match(errors, /broken link "\/also-removed"/);
  const good = fixture({
    "a.mdx": page() + "[p](/docs/a_(old).mdx) [r][g]\n\n[g]: /docs/a_(old) \"Title\"\n<Card href={`/docs/a_(old)`}>x</Card>\n",
    "docs/a_(old).mdx": page(),
  });
  assert.deepEqual(checkDocs(good).errors, []);
});

test("multiline references, nested parens, multiline template hrefs and undefined references", () => {
  const bad = fixture({
    "a.mdx": page() +
      "[guide][g]\n\n[g]:\n  /removed-page\n\n<Card\n  href={\n    `/also-removed`\n  }\n/> and `code`\n" +
      "<Card href={`/third`} /> then `x`\n[dangling][missing] [Collapsed][]\n",
  });
  const errors = checkDocs(bad).errors;
  assert.deepEqual(errors, [
    'a.mdx:10: broken link "/removed-page"',
    'a.mdx:14: broken link "/also-removed"',
    'a.mdx:18: broken link "/third"',
    'a.mdx:19: undefined link reference "missing"',
    'a.mdx:19: undefined link reference "collapsed"',
  ]);
  const good = fixture({
    "a.mdx": page() + "[p](/docs/a_(b_(c_(old))).mdx) [r][G]\n\n[g]: /docs/a_(b_(c_(old)))\n",
    "docs/a_(b_(c_(old))).mdx": page(),
  });
  assert.deepEqual(checkDocs(good).errors, []);
});

test("commented-out links and an unmatched backtick are handled", () => {
  const ok = fixture({
    "a.mdx": page() + '{/* <Card href="/removed" /> */}\n{/*\n[x](/gone)\n*/}\n<!-- [y](/gone) -->\n',
    "holocron.jsonc": '{\n  // old favicon: "/removed.svg"\n  /* "/also-removed.svg" */\n  "url": "https://x.y/a"\n}\n',
  });
  assert.deepEqual(checkDocs(ok).errors, []);
  const bad = fixture({ "a.mdx": page() + "a stray ` backtick\n\n[x](/gone)\n\nlater ` one\n" });
  assert.deepEqual(checkDocs(bad).errors, ['a.mdx:10: broken link "/gone"']);
});

test("MDX expressions and footnotes are not links; nested and wrapped labels are checked", () => {
  const ok = fixture({
    "a.mdx": page() + "Value {matrix[row][column]} and {f({a: x[0][1]})}.\n\nSee note[^1].\n\n[^1]: This is a note\n",
  });
  assert.deepEqual(checkDocs(ok).errors, []);
  const bad = fixture({
    "a.mdx": page() + "[![Status](/badge.svg)](/removed-page)\n\n[Read the full\nguide](/wrapped-gone)\n",
  });
  assert.deepEqual(checkDocs(bad).errors, [
    'a.mdx:8: broken link "/removed-page"',
    'a.mdx:8: broken link "/badge.svg"',
    'a.mdx:10: broken link "/wrapped-gone"',
  ]);
});

test("links escaping the repository are reported", () => {
  const dir = fixture({ "a.mdx": page() + "[up](../../etc/passwd)\n" });
  assert.match(checkDocs(dir).errors.join("\n"), /broken link/);
});

test("missing root-relative paths in holocron.jsonc are reported", () => {
  const bad = fixture({ "a.mdx": page(), "holocron.jsonc": '{\n  "favicon": { "light": "/favicon.svg" },\n  "logo": "https://x.y/l.svg"\n}\n' });
  assert.deepEqual(checkDocs(bad).errors, ['holocron.jsonc:2: path "/favicon.svg" does not exist']);
  const good = fixture({ "a.mdx": page(), "favicon.svg": "<svg/>", "holocron.jsonc": '{ "favicon": { "light": "/favicon.svg" } }' });
  assert.deepEqual(checkDocs(good).errors, []);
});

test("orphaned files from the starter are gone", () => {
  for (const f of ["dB_requirements.md", "requirements_management.png"]) {
    assert.ok(!existsSync(join(repoRoot, f)), `${f} should not exist`);
  }
});
