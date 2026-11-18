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

// node_modules is skipped at any depth. Build output and hidden dirs
// (.git, .github, .cache, ...) are skipped only at the repository root, so
// content in nested folders such as guides/build/ is still checked.
const ROOT_IGNORED_DIRS = new Set(["dist", "build", "out"]);
const REQUIRED_FIELDS = ["title", "description", "icon"];

function walk(dir, out = [], depth = 0) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      if (depth === 0 && (ROOT_IGNORED_DIRS.has(entry.name) || entry.name.startsWith("."))) continue;
      walk(join(dir, entry.name), out, depth + 1);
    } else if (entry.isFile()) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

// Required fields must be plain or quoted single-line strings. YAML tags
// (!!str), anchors (&a), aliases (*a) and block scalars (| >) are rejected
// rather than half-parsed, as are unterminated quotes and repeated keys. Returns { value } or { unsupported: true }.
export function scalarValue(raw) {
  const text = raw.trim();
  if (/^[!&*|>]/.test(text)) return { unsupported: true };
  const quoted = text.match(/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')\s*(?:#.*)?$/);
  if (quoted) return { value: quoted[1].slice(1, -1).trim() };
  // An opening quote without a matching close (or a multi-line quoted value).
  if (/^["']/.test(text)) return { unsupported: true };
  const value = text.replace(/(^|\s)#.*$/, "").trim();
  if (value === "~" || /^null$/i.test(value)) return { value: "" };
  return { value };
}

export function parseFrontmatter(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end === -1) return null;
  const body = lines.slice(1, end);
  const fields = {};
  for (const line of body) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    // A repeated key must not let a later value hide an earlier one.
    fields[kv[1]] = kv[1] in fields ? { unsupported: true } : scalarValue(kv[2]);
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
      if (fm[field]?.unsupported) {
        errors.push(`${rel(file)}: frontmatter field ${field} must be a plain or quoted single-line string`);
      } else if (!fm[field]?.value) {
        errors.push(`${rel(file)}: missing frontmatter field ${field}`);
      }
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
      if (!/^[\w][\w.-]*$/.test(name) || /^\.+$/.test(name)) {
        errors.push(`${rel(file)}: invalid pages entry ${JSON.stringify(page)} (expected a page or folder name)`);
        continue;
      }
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
