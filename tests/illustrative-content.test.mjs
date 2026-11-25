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

const num = String.raw`\d+(?:\.\d+)?(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?`;
const speedupPatterns = [
  // "3-5x", "10x", "2.5 times" as a multiplier
  new RegExp(String.raw`\b${num}\s*(?:x|×|times)\b`, "i"),
  // "50% faster", "30-40 % reduction"
  new RegExp(String.raw`\b${num}\s*%\s*(?:faster|slower|quicker|speed|improvement|better|reduction|less|fewer|lower|higher|more)\b`, "i"),
];
const hasSpeedup = (line) => speedupPatterns.some((re) => re.test(line));

test("speedup detector catches the forms it should", () => {
  for (const s of ["3-5x faster", "10x faster", "1.5-2x improvement", "2.5 times quicker", "50% faster", "30-40 % reduction"]) {
    assert.ok(hasSpeedup(s), s);
  }
  for (const s of ["value: 10000  # Filters 90% of orders", 'condition: "failure_rate > 10%"', "max_retries: 3"]) {
    assert.ok(!hasSpeedup(s), s);
  }
});

test("no unsourced performance figures (e.g. '3-5x faster', '50% faster')", () => {
  for (const f of pages) {
    const hits = read(f).split("\n").filter(hasSpeedup);
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
