<!-- Copied/merged guidance for agent workflows in this workspace. Keep concise and actionable. -->
# Copilot instructions for holocron-starter-docs

This repository holds documentation and content for Holocron starter docs. The workspace also contains related tooling and example agent guidance in sibling folders (see `../agents/AGENTS.md`). Use the notes below to be productive immediately.

1. Quick start (developer session)
   - Use Node 22 / npm 10 (see `.nvmrc` and `engines` in `package.json`). Install deps at repo root with `npm ci`; `node_modules/` is not committed.
   - `npm run dev` runs `cli dev` from `@holocron.so/cli`, which syncs files to the holocron.so site in `holocron.jsonc` (needs network access).
   - `npm run check` validates the docs offline and is safe to run at any time.

2. Where to look for the most important content
   - Docs/content: `rules-and-workflows/` — includes `index.mdx`, `rules.mdx`, `workflows.mdx`, `best-practices.mdx` and `meta.json` (frontmatter and `meta.json` control nav and page order).
   - Repo README: `README.md` at repository root contains high-level notes.
   - Workspace-level agent guidance: `agents/AGENTS.md` (in the workspace root) contains agent-specific workflow tips (hot-reload, dependency handling, commands).

3. File and content conventions you must preserve
   - MDX pages use YAML/MDX frontmatter: keep `title`, `description`, and `icon` fields intact when editing (see `rules-and-workflows/*.mdx`).
   - `meta.json` lists pages and controls navigation; update it when adding/removing docs pages.
   - Examples (in `rules.mdx`) show canonical YAML shapes for rules: triggers, conditions, actions. If changing schema, search the docs and update all examples and `meta.json`.

4. Common tasks and examples
   - Add a new doc page: create `rules-and-workflows/<slug>.mdx` with frontmatter and add the filename (without extension) to `rules-and-workflows/meta.json` `pages` array.
   - Update examples: prefer editing the example YAML blocks in `rules.mdx` to keep real examples consistent with UI/schema.

5. Build / test / lint notes
   - The only scripts are `npm run check` (offline docs validation: frontmatter `title`/`description`/`icon` and `meta.json` pages), `npm run build` (runs `check`; CI runs it), `npm test` (tests for the check script) and `npm run dev`. There is no lint script.
   - Run `npm run check` before committing doc changes. If you change dependencies, commit the updated root `package-lock.json`.

6. Integration and boundaries
   - This repo is documentation only. The rules engine, workflow builder, API endpoints and CLI commands in `rules-and-workflows/` are illustrative starter content; no implementation repo exists. Keep the banner on `index.mdx` and the illustrative notes, and do not add unsourced performance figures (`tests/illustrative-content.test.mjs` flags the common forms, such as `3-5x faster` or `50% faster`, but cannot catch every phrasing).
   - When adding references to external APIs or runtime behavior, include links or pointers to the implementation repo and any relevant API examples.

7. Agent-specific constraints
   - Keep edits atomic and focused: small doc updates or single example fixes are preferred.
   - When modifying navigation or adding/removing pages, update `meta.json` and run `npm run check` to verify every listed page exists.

If anything below is unclear or you need more details (build steps, package manager conventions, or where runtime services live), tell me which area you want expanded and I'll iterate.
