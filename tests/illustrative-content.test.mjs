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
  assert.match(body, /<Warning>(?:(?!<\/Warning>)[\s\S])*illustrative(?:(?!<\/Warning>)[\s\S])*<\/Warning>/i);
});

const num = String.raw`\d+(?:\.\d+)?(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?`;
const perfWord = String.raw`(?:faster|slower|quicker|speed(?:up)?|latency|throughput|performance|improve(?:d|ment)?|reduc(?:e|ed|es|tion)|overhead|better)`;
const speedupPatterns = [
  // a multiplier on the same line as a performance word: "3-5x faster", "10× throughput"
  new RegExp(String.raw`(?=.*\b${perfWord}).*\b${num}\s*(?:x|×)(?![a-z0-9_])`, "i"),
  // "2.5 times quicker"
  new RegExp(String.raw`\b${num}\s+times\s+${perfWord}`, "i"),
  // a percentage on the same line as a performance word: "50% faster", "latency reduced by 50%"
  new RegExp(String.raw`(?=.*\b${perfWord}).*\b${num}\s*%`, "i"),
];
// A line that links to its source (an http(s) URL) is treated as sourced.
const isSourced = (line) => /https?:\/\//i.test(line);
const hasSpeedup = (line) => !isSourced(line) && speedupPatterns.some((re) => re.test(line));

test("speedup detector catches the forms it should", () => {
  for (const s of ["3-5x faster", "10x faster", "3× faster", "1.5-2x improvement", "2.5 times quicker", "50% faster", "30-40 % reduction", "50% latency reduction", "latency reduced by 50%"]) {
    assert.ok(hasSpeedup(s), s);
  }
  for (const s of ["value: 10000  # Filters 90% of orders", 'condition: "failure_rate > 10%"', "max_retries: 3", "retry the request 3 times", "0x1F", "avg_execution_time > 2x_baseline", "3x zoom", "a 2× grid", "[Benchmark](https://example.com) reports 50% lower latency"]) {
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
