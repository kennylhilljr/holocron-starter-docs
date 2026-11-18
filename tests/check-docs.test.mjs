import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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

for (const value of ["!!null", "!!str null", "!<tag:yaml.org,2002:null>", "!!str |", "&a", "&a Title", "*a", "|", ">-", "|\n  Block title\n"]) {
  test(`unsupported YAML title ${JSON.stringify(value)} is rejected`, () => {
    const dir = fixture({ "a.mdx": page(value) });
    assert.match(checkDocs(dir).errors.join("\n"), /field title must be a plain or quoted/);
  });
}

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
