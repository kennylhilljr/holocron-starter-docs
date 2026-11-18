#!/usr/bin/env node
// Offline docs validation. No network, no dependencies.
// Checks:
//   1. Every .mdx file has frontmatter with non-empty title, description and icon.
//   2. Every page listed in a meta.json "pages" array resolves to <page>.mdx
//      or to a <page>/ folder next to that meta.json.
// Usage: node scripts/check-docs.mjs [rootDir]   (default: repository root)

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname, resolve, basename, sep } from "node:path";
import { fileURLToPath } from "node:url";

const IGNORED_DIRS = new Set(["node_modules", "dist", "build", "out"]);
const REQUIRED_FIELDS = ["title", "description", "icon"];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // Skip dependencies, build output and hidden dirs (.git, .cache, .github, ...).
      if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith(".")) walk(join(dir, entry.name), out);
    } else if (entry.isFile()) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

// Reduce a single-line YAML scalar to its string value. Returns "" for empty,
// null, "~", tag-only or comment-only values so they fail the required check.
export function scalarValue(raw) {
  let text = raw.trim().replace(/^!!?[\w/:.-]*(?:\s+|$)/, "");
  const isNullTag = /^!!null\b/.test(raw.trim());
  const quoted = text.match(/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')\s*(?:#.*)?$/);
  if (quoted) return isNullTag ? "" : quoted[1].slice(1, -1).trim();
  text = text.replace(/(^|\s)#.*$/, "").trim();
  if (isNullTag || text === "~" || /^null$/i.test(text)) return "";
  return text;
}

export function parseFrontmatter(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end === -1) return null;
  const body = lines.slice(1, end);
  const fields = {};
  for (let i = 0; i < body.length; i++) {
    const kv = body[i].match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const head = kv[2].replace(/(^|\s)#.*$/, "").trim();
    if (/^[|>][-+0-9]*$/.test(head)) {
      // Block scalar: value is the following indented lines.
      const block = [];
      while (i + 1 < body.length && (/^\s+\S/.test(body[i + 1]) || body[i + 1].trim() === "")) {
        block.push(body[++i].trim());
      }
      fields[kv[1]] = block.join(" ").trim();
    } else {
      fields[kv[1]] = scalarValue(kv[2]);
    }
  }
  return fields;
}

const isSkippedPageEntry = (page) =>
  page === "..." || page === "z...a" || /^---.*---$/.test(page) || /^\[.*\]\(.*\)$/.test(page);

export function checkDocs(rootDir) {
  const root = resolve(rootDir);
  const errors = [];
  const rel = (p) => (relative(root, p) || ".").split(sep).join("/");
  const files = walk(root);
  const mdxFiles = files.filter((f) => f.endsWith(".mdx"));
  const metaFiles = files.filter((f) => basename(f) === "meta.json");

  for (const file of mdxFiles) {
    const fm = parseFrontmatter(readFileSync(file, "utf8"));
    if (!fm) {
      errors.push(`${rel(file)}: missing frontmatter`);
      continue;
    }
    for (const field of REQUIRED_FIELDS) {
      if (!fm[field]) errors.push(`${rel(file)}: missing frontmatter field ${field}`);
    }
  }

  for (const file of metaFiles) {
    let meta;
    try {
      meta = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      errors.push(`${rel(file)}: invalid JSON`);
      continue;
    }
    if (meta === null || typeof meta !== "object" || meta.pages === undefined) continue;
    if (!Array.isArray(meta.pages)) {
      errors.push(`${rel(file)}: "pages" must be an array`);
      continue;
    }
    const dir = dirname(file);
    for (const page of meta.pages) {
      if (typeof page !== "string" || page.trim() === "") {
        errors.push(`${rel(file)}: invalid pages entry ${JSON.stringify(page)}`);
        continue;
      }
      if (isSkippedPageEntry(page)) continue;
      const name = page.replace(/^!/, "");
      const folder = join(dir, name);
      const ok =
        (existsSync(`${folder}.mdx`) && statSync(`${folder}.mdx`).isFile()) ||
        (existsSync(folder) && statSync(folder).isDirectory());
      if (!ok) errors.push(`${rel(file)}: page "${page}" has no matching .mdx file`);
    }
  }

  if (mdxFiles.length === 0) errors.push("no .mdx files found");
  return { errors, pages: mdxFiles.length, metas: metaFiles.length };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
  const { errors, pages, metas } = checkDocs(root);
  if (errors.length) {
    console.error(`Docs check failed with ${errors.length} problem(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`Docs check passed: ${pages} pages, ${metas} meta files`);
}
