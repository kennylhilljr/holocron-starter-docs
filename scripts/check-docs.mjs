#!/usr/bin/env node
// Offline docs validation. No network, no dependencies.
// Checks:
//   1. Every .mdx file has frontmatter with non-empty title, description and icon.
//   2. Every page listed in a meta.json "pages" array resolves to <page>.mdx
//      or to a <page>/ folder next to that meta.json.
// Exits non-zero and lists every problem found.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".holocron"]);
const REQUIRED_FIELDS = ["title", "description", "icon"];

const errors = [];
const rel = (p) => relative(root, p) || ".";

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) walk(join(dir, entry.name), out);
    } else if (entry.isFile()) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

// Reduce a YAML scalar to its string value. Returns "" for empty, null,
// "~" or comment-only values so they fail the required-field check.
function scalarValue(raw) {
  const text = raw.trim();
  const quoted = text.match(/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')\s*(?:#.*)?$/);
  if (quoted) return quoted[1].slice(1, -1).trim();
  const value = text.replace(/(^|\s)#.*$/, "").trim();
  if (value === "~" || /^null$/i.test(value)) return "";
  return value;
}

function parseFrontmatter(text) {
  const match = text.replace(/^﻿/, "").match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    fields[kv[1]] = scalarValue(kv[2]);
  }
  return fields;
}

function checkMdx(file) {
  const fm = parseFrontmatter(readFileSync(file, "utf8"));
  if (!fm) {
    errors.push(`${rel(file)}: missing frontmatter block`);
    return;
  }
  for (const field of REQUIRED_FIELDS) {
    if (!fm[field]) errors.push(`${rel(file)}: frontmatter is missing a non-empty "${field}"`);
  }
}

function checkMeta(file) {
  let meta;
  try {
    meta = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    errors.push(`${rel(file)}: invalid JSON (${err.message})`);
    return;
  }
  if (meta.pages === undefined) return;
  if (!Array.isArray(meta.pages)) {
    errors.push(`${rel(file)}: "pages" must be an array`);
    return;
  }
  const dir = dirname(file);
  for (const page of meta.pages) {
    if (typeof page !== "string" || page.trim() === "") {
      errors.push(`${rel(file)}: invalid pages entry ${JSON.stringify(page)}`);
      continue;
    }
    // "..." / "z...a" are rest markers, "---Label---" are separators,
    // "[Text](url)" are external links: none of these map to a file.
    if (/^(z?\.\.\.a?|\.\.\.)$/.test(page) || /^---.*---$/.test(page) || /^\[.*\]\(.*\)$/.test(page)) continue;
    const name = page.replace(/^!/, "");
    const mdx = join(dir, `${name}.mdx`);
    const folder = join(dir, name);
    const ok = existsSync(mdx) || (existsSync(folder) && statSync(folder).isDirectory());
    if (!ok) errors.push(`${rel(file)}: page "${page}" has no matching ${rel(mdx)}`);
  }
}

const files = walk(root);
const mdxFiles = files.filter((f) => f.endsWith(".mdx"));
const metaFiles = files.filter((f) => f.endsWith("/meta.json") || f === join(root, "meta.json"));

mdxFiles.forEach(checkMdx);
metaFiles.forEach(checkMeta);

if (mdxFiles.length === 0) errors.push("no .mdx files found");

if (errors.length) {
  console.error(`Docs check failed with ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`Docs check passed: ${mdxFiles.length} .mdx file(s), ${metaFiles.length} meta.json file(s).`);
