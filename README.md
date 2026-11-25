# holocron-starter-docs

Source for a small documentation site about rules and workflows, published with [Holocron](https://holocron.so).

## What the docs cover

The pages live in `rules-and-workflows/` and are ordered by its `meta.json`:

- `index.mdx`: overview
- `rules.mdx`: writing and testing rules
- `workflows.mdx`: building and testing workflows
- `best-practices.mdx`: guidance for both

Site settings (name, navbar, footer, socials, domains) are in `holocron.jsonc`.

## How deploys happen

There is no build or deploy step in this repo. Holocron hosts the site: `siteId` in `holocron.jsonc` ties the repo to a Holocron site, which is served on the hostnames listed under `domains`. `npm run dev` syncs local files to holocron.so for preview. CI (below) only validates the docs; it does not publish anything.

## License

No open-source license is granted. `package.json` is marked `"private": true` with `"license": "UNLICENSED"` so it cannot be published to npm by accident.

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
| `npm test` | Runs the `node:test` suite in `tests/`: the docs check, plus checks that `holocron.jsonc` and `package.json` no longer carry the starter defaults. |
| `npm run dev` | Runs `cli dev` from `@holocron.so/cli`. It reads `siteId` from `holocron.jsonc` and syncs files to holocron.so, so it needs network access. |

## CI

`.github/workflows/ci.yml` runs `npm ci`, `npm run build` and `npm test` on every pull request and on pushes to `main`. It runs fully offline (apart from installing packages) and uses no secrets. A broken docs check fails the job.
