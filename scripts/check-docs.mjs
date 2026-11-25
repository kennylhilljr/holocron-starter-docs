#!/usr/bin/env node
// Offline docs validation. No network, no dependencies.
// Checks:
//   1. Every .mdx file has frontmatter with non-empty title, description and icon.
//   2. Every page listed in a meta.json "pages" array resolves to <page>.mdx
//      or to a <page>/ folder next to that meta.json.
//   3. Every internal link in an .mdx file (markdown links and JSX href/src
//      attributes, outside code) and every root-relative path in
//      holocron.jsonc resolves to a page (<path>.mdx or <path>/index.mdx) or
//      to a file in the repository (or public/).
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
// (!!str), anchors (&a), aliases (*a), block scalars (| >) and flow
// collections ([ {) are rejected
// rather than half-parsed, as are unterminated quotes and repeated keys. Returns { value } or { unsupported: true }.
export function scalarValue(raw) {
  const text = raw.trim();
  if (/^[!&*|>\[{]/.test(text)) return { unsupported: true };
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
  const unsupportedLines = [];
  for (const line of body) {
    // Blank lines, comments, indented continuation and list items are left to
    // YAML; only top-level "key: value" lines carry the required fields.
    if (line.trim() === "" || /^\s/.test(line) || /^#/.test(line) || /^-(\s|$)/.test(line)) continue;
    // Only plain identifier keys are supported at the top level; quoted,
    // escaped, tagged or flow-style keys are rejected rather than parsed.
    const kv = line.match(/^([A-Za-z_][\w-]*):(?:[ \t]+(.*)|$)/);
    if (!kv) {
      unsupportedLines.push(line);
      continue;
    }
    const key = kv[1];
    // A repeated key must not let a later value hide an earlier one.
    fields[key] = key in fields ? { unsupported: true } : scalarValue(kv[2] ?? "");
  }
  Object.defineProperty(fields, "unsupportedLines", { value: unsupportedLines });
  return fields;
}

const isSkippedPageEntry = (page) =>
  page === "..." || page === "z...a" || /^---.*---$/.test(page) || /^\[.*\]\(.*\)$/.test(page);

// Strip fenced code blocks and inline code so example snippets are not
// treated as links. Line count is preserved so reported lines stay accurate.
export function stripCode(text) {
  const lines = text.split(/\r?\n/);
  let fence = null;
  return lines
    .map((line) => {
      const open = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (fence) {
        const close = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
        if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
        return "";
      }
      if (open) {
        fence = open[1];
        return "";
      }
      // Keep static template literals in JSX attributes (href={`/x`}).
      return line.replace(/(?<!=\s*\{\s*)(`+)[\s\S]*?\1/g, "");
    })
    .join("\n");
}

// Internal link targets in MDX: markdown links/images, reference definitions and JSX href/src
// attributes. External URLs (scheme:, //host), pure anchors and expressions
// ({...}) are ignored.
export function extractLinks(text) {
  const body = stripCode(text);
  const links = [];
  const add = (target, index) => {
    const t = target.trim().replace(/^<(.*)>$/, "$1");
    if (!t || t.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith("//")) return;
    links.push({ target: t, index, line: body.slice(0, index).split("\n").length });
  };
  // Inline links; the destination may contain one level of balanced parens.
  for (const m of body.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>\n]*>|(?:[^()\s]|\([^()\s]*\))+)(?:\s+["'(][^)]*)?\)/g)) add(m[1], m.index);
  // Reference definitions: [label]: target
  for (const m of body.matchAll(/^ {0,3}\[[^\]\n]+\]:[ \t]*(<[^>\n]*>|\S+)/gm)) add(m[1], m.index);
  for (const m of body.matchAll(/\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*(?:"([^"]*)"|'([^']*)'|`([^`$]*)`)\s*\})/g)) {
    add(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5], m.index);
  }
  return links.sort((a, b) => a.index - b.index);
}

// Resolve an internal link to a page or file. Root-relative links resolve
// against the repository root, others against the linking file's folder.
export function linkResolves(root, fromDir, target) {
  let path = target.replace(/[?#].*$/, "");
  if (path === "") return true;
  try {
    path = decodeURIComponent(path);
  } catch {
    return false;
  }
  const base = path.startsWith("/") ? root : fromDir;
  const abs = resolve(base, "." + (path.startsWith("/") ? path : "/" + path));
  if (abs !== root && !abs.startsWith(root + sep)) return false;
  if (abs === root) return true;
  const isFile = (p) => existsSync(p) && statSync(p).isFile();
  const candidates = [abs.replace(/\/$/, "") + ".mdx", join(abs, "index.mdx"), abs];
  if (path.startsWith("/")) candidates.push(resolve(root, "public", "." + path));
  return candidates.some(isFile);
}

// Root-relative string values ("/favicon.svg") in holocron.jsonc.
export function configPaths(text) {
  const paths = [];
  for (const m of text.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    const v = m[1];
    if (v.startsWith("/") && !v.startsWith("//")) paths.push({ target: v, line: text.slice(0, m.index).split("\n").length });
  }
  return paths;
}

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
    for (const line of fm.unsupportedLines) {
      errors.push(`${rel(file)}: unsupported frontmatter line ${JSON.stringify(line)}`);
    }
    for (const field of REQUIRED_FIELDS) {
      if (fm[field]?.unsupported) {
        errors.push(`${rel(file)}: frontmatter field ${field} must be a plain or quoted single-line string`);
      } else if (!fm[field]?.value) {
        errors.push(`${rel(file)}: missing frontmatter field ${field}`);
      }
    }
  }

  for (const file of mdxFiles) {
    for (const { target, line } of extractLinks(readFileSync(file, "utf8"))) {
      if (!linkResolves(root, dirname(file), target)) errors.push(`${rel(file)}:${line}: broken link ${JSON.stringify(target)}`);
    }
  }

  const config = join(root, "holocron.jsonc");
  if (existsSync(config)) {
    for (const { target, line } of configPaths(readFileSync(config, "utf8"))) {
      if (!linkResolves(root, root, target)) errors.push(`holocron.jsonc:${line}: path ${JSON.stringify(target)} does not exist`);
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
