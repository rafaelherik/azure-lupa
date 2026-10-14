# Contributing to azure-lupa

Thanks for helping make Azure inventories easier to navigate. This guide covers how to report problems, set up the project, and get a change merged.

## Ways to contribute

- **Report a bug.** Open an issue with what you did, what you expected, what happened, your OS, your Node.js version and the output of `azure-lupa --verbose` (remove tenant and subscription IDs first).
- **Suggest a feature.** Open an issue describing the problem you're trying to solve before writing code, so we can agree on the approach.
- **Improve the docs.** Typos, clearer wording and examples are always welcome.
- **Send a pull request.** Look for issues labeled `good first issue` or `help wanted`, or one you've discussed.

Security issues should **not** go in public issues. Report them through [GitHub security advisories](https://github.com/rafaelherik/azure-lupa/security/advisories/new).

## Project principles

Every change should keep these true:

1. **Read-only.** azure-lupa never creates, changes or deletes anything in Azure.
2. **Local only.** The server listens on `127.0.0.1` and requires the per-session token.
3. **Fast first.** Never load more than the user asked to see, and show cached data right away.
4. **Never fail silently.** Auth and throttling errors should tell the user the exact next step (for example `az login --tenant <id>`).

`PRODUCT.md` and `DESIGN.md` describe the product and visual direction in more detail.

## Development setup

You need:

- [Node.js](https://nodejs.org) 24+ (`.nvmrc` pins the version, so `nvm use` works)
- [Azure CLI](https://aka.ms/azure-cli), signed in with `az login`, to try the app against real data
- [pre-commit](https://pre-commit.com) (`pipx install pre-commit` or `brew install pre-commit`)
- Optionally, [Task](https://taskfile.dev)

```sh
git clone https://github.com/rafaelherik/azure-lupa.git
cd azure-lupa
npm install
pre-commit install   # installs both the pre-commit and commit-msg hooks
npm run dev          # API on :4517 + Vite on :5173
```

Open <http://localhost:5173/#token=dev>.

### Project layout

| Path          | What lives there                                                     |
| ------------- | -------------------------------------------------------------------- |
| `src/server/` | Fastify server, CLI, Azure clients (Resource Graph, ARM), disk cache |
| `src/web/`    | React 19 + Vite + Tailwind single-page app                           |
| `src/shared/` | Types shared by the server and the web app                           |
| `test/`       | Vitest unit tests                                                    |
| `bin/`        | The `azure-lupa` executable published to npm                         |

## Checks

These run in CI on every pull request. Run them locally before pushing:

```sh
npm run lint          # oxlint
npm run format:check  # Prettier (npm run format to fix)
npm run typecheck
npm test
npm run build
```

`task lint`, `task test` and `task build` do the same through Task.

The pre-commit hooks run oxlint and Prettier on staged files, fix trailing whitespace and missing final newlines, and check your commit message. To run every hook on the whole repository:

```sh
pre-commit run --all-files
```

### Code style

- Formatting belongs to [Prettier](https://prettier.io) (`.prettierrc.json`), so don't adjust formatting by hand.
- Linting is done by [oxlint](https://oxc.rs/docs/guide/usage/linter) (`.oxlintrc.json`), including React hook rules for `src/web`.
- TypeScript runs in `strict` mode with `noUncheckedIndexedAccess`. Avoid `any` and non-null assertions where a narrowing check works.
- Add or update tests in `test/` when you change server logic such as KQL building, caching or HTTP retries.

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org). The `commit-msg` hook and CI both check them with [commitlint](https://commitlint.js.org).

```
<type>(<optional scope>): <short summary>

<optional body>

<optional footer, e.g. BREAKING CHANGE: ...>
```

| Type       | Use it for                                              |
| ---------- | ------------------------------------------------------- |
| `feat`     | A new user-facing feature                               |
| `fix`      | A bug fix                                               |
| `docs`     | Documentation only                                      |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf`     | Performance improvement                                 |
| `test`     | Adding or fixing tests                                  |
| `build`    | Build system or dependencies                            |
| `ci`       | CI configuration                                        |
| `chore`    | Maintenance that doesn't fit elsewhere                  |
| `style`    | Formatting only, no code change                         |
| `revert`   | Reverting a previous commit                             |

Examples:

```
feat(web): filter resources by tag value
fix(server): honor Retry-After on 429 from Resource Graph
docs: explain cache location in README
feat!: require Node.js 24
```

Mark breaking changes with `!` after the type, or with a `BREAKING CHANGE:` footer.

## Pull requests

1. Fork the repository and create a branch from `main`. Use a prefix that matches the change, such as `feat/tag-filter`, `fix/retry-after` or `docs/cache`.
2. Keep the PR focused on one change, and include tests and docs updates where relevant.
3. **Give the PR a conventional title.** PRs are squash-merged, so the title becomes the commit on `main`. Release Drafter also uses it to label the PR and pick the next version (`feat` → minor, `fix`/others → patch, `!` → major).
4. Make sure CI is green, then request a review.
5. For UI changes, add a screenshot or short recording to the PR description.

## Releases

Maintainers publish releases from the draft that Release Drafter keeps up to date. See [Releasing](README.md#releasing) in the README.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
