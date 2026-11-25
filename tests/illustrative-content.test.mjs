import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The rules-and-workflows pages are starter/demo content for a product that
// does not exist. Keep them clearly labelled and free of unsourced numbers.
const docsDir = fileURLToPath(new URL("../rules-and-workflows", import.meta.url));
const pages = readdirSync(docsDir).filter((f) => f.endsWith(".mdx"));
const read = (f) => readFileSync(join(docsDir, f), "utf8");

test("index page carries the illustrative-content banner", () => {
  const body = read("index.mdx");
  assert.match(body, /<Warning>[\s\S]*illustrative[\s\S]*<\/Warning>/i);
});

test("no unsourced speedup figures (e.g. '3-5x faster')", () => {
  const speedup = /\b\d+(?:\.\d+)?\s*(?:-|–|to)\s*\d+(?:\.\d+)?\s*x\b/i;
  for (const f of pages) {
    const hits = read(f).split("\n").filter((line) => speedup.test(line));
    assert.deepEqual(hits, [], `${f} has speedup figures`);
  }
});

test("pages showing example endpoints or commands say they are illustrative", () => {
  const invented = /\/api\/|\btest-rule\b|\brun-workflow-test\b/;
  for (const f of pages) {
    const body = read(f);
    if (invented.test(body)) assert.match(body, /illustrative/i, `${f} lacks an illustrative note`);
  }
});
