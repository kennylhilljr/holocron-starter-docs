# holocron-starter-docs
Repository created using Holocron

## Requirements

- Node.js 22 LTS (pinned in `.nvmrc`; run `nvm use` or an equivalent)
- npm 10

Both are recorded in the `engines` field of `package.json`.

## Setup

```sh
npm ci
```

`node_modules/` is not committed. `npm ci` installs exactly what `package-lock.json` lists.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run check` | Offline validation of the docs. Every `.mdx` file needs frontmatter with `title`, `description` and `icon`, and every page in a `meta.json` `pages` array needs a matching `.mdx` file (or folder). Top-level frontmatter keys must be plain names written as `key: value`, and the required fields must be non-empty single-line values, plain or quoted (YAML tags, anchors, block scalars and `[...]`/`{...}` collections are rejected). |
| `npm run build` | Runs `npm run check`. The Holocron CLI has no local build, so this is the build CI runs. |
| `npm test` | Runs the `node:test` suite for the docs check (`tests/`). |
| `npm run dev` | Runs `cli dev` from `@holocron.so/cli`. It reads `siteId` from `holocron.jsonc` and syncs files to holocron.so, so it needs network access. |

## CI

`.github/workflows/ci.yml` runs `npm ci`, `npm run build` and `npm test` on every pull request and on pushes to `main`. It runs fully offline (apart from installing packages) and uses no secrets. A broken docs check fails the job.
