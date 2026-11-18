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
| `npm run check` | Offline validation of the docs. Every `.mdx` file needs frontmatter with `title`, `description` and `icon`, and every page in a `meta.json` `pages` array needs a matching `.mdx` file (or folder). |
| `npm run build` | Runs `npm run check`. The Holocron CLI has no local build, so this is the build CI runs. |
| `npm run dev` | Runs `cli dev` from `@holocron.so/cli`. It reads `siteId` from `holocron.jsonc` and syncs files to holocron.so, so it needs network access and a Holocron login. |

## CI

`.github/workflows/ci.yml` runs `npm ci` and `npm run build` on every pull request and on pushes to `main`. It runs fully offline (apart from installing packages) and uses no secrets. A broken docs check fails the job.
