<p align="center">
  <img src="https://raw.githubusercontent.com/rafaelherik/azure-lupa/main/assets/images/logo-main.jpeg" alt="azure-lupa" width="480">
</p>

<p align="center">
  <strong>Navigate your Azure resource inventory: fast, local and read-only.</strong>
</p>

<p align="center">
  <a href="https://github.com/rafaelherik/azure-lupa/actions/workflows/ci.yml"><img src="https://github.com/rafaelherik/azure-lupa/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/azure-lupa"><img src="https://img.shields.io/npm/v/azure-lupa" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/rafaelherik/azure-lupa" alt="License: MIT"></a>
  <a href="https://www.conventionalcommits.org"><img src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-fe5196?logo=conventionalcommits&logoColor=white" alt="Conventional Commits"></a>
</p>

---

**azure-lupa** (_lupa_ is Portuguese and Spanish for "magnifying glass") is an open-source explorer for everything you can see in Azure. It runs on your machine, reuses your existing Azure CLI login, and gives you one fast view of your tenants, subscriptions, resource groups and resources.

```sh
npx azure-lupa
```

## Why azure-lupa?

If you work across many tenants and subscriptions, for example as a consultant, at an MSP, or on a platform team, the Azure Portal is slow for questions like _"what do we have, and where?"_. azure-lupa is built for that job:

- **Fast.** Each scope is loaded once from Azure Resource Graph into an in-browser [DuckDB](https://duckdb.org/docs/stable/clients/wasm/overview) database, so filtering, sorting and the dashboard are instant and cost no further API calls.
- **Multi-tenant.** Browse every tenant your `az login` can reach and combine subscriptions in one view.
- **Read-only and local.** It never writes to Azure, and it only listens on `127.0.0.1`. Your credentials stay with the Azure CLI.
- **Zero setup.** No app registration, no service principal, nothing to deploy.

## Quick start

```sh
az login          # if you aren't signed in yet
npx azure-lupa    # starts a local server and opens your browser
```

## Features

- Browse **tenants → subscriptions → resource groups**
- List every resource in one or more subscriptions, with **search**, **type / location / resource group / tag filters** and sortable columns
- Open a resource to see its **essentials, related resources** (parent, children, what it uses and what uses it), **tags, property tree and raw JSON**, copy its ID, or jump to the Azure Portal
- **Orphan detection**: resources that look abandoned (unattached disks, unassociated public IPs, NICs and NSGs, empty App Service plans, VNet gateways without connections, empty resource groups and more) are flagged, filterable with **Orphans**, and summarized on the dashboard. The rules follow the [Azure Orphaned Resources workbook](https://github.com/dolevshor/azure-orphan-resources); treat them as hints and confirm before deleting anything
- A **dashboard** of counts by type, location, subscription and resource group (select a bar to drill in)
- **Azure service icons** for common resource types
- **Export** the current view to CSV or JSON
- `⌘` / `Ctrl` + click a subscription to **combine several in one view**; `Esc` closes the details panel

## Requirements

- Node.js 24+
- [Azure CLI](https://aka.ms/azure-cli), signed in with `az login`
- **Reader** access to whatever you want to see

Tenants that need their own sign-in (MFA or conditional access) show the exact command to run, for example `az login --tenant <id>`.

## How it loads data

- Nothing is fetched until you open it: subscriptions load when you expand a tenant, and resources load when you select a subscription.
- Selecting subscriptions loads a **snapshot** of their resources from **Azure Resource Graph**. The server keeps only what the UI needs (list fields, the few properties orphan rules check, and the IDs each resource references) and the browser loads it into **DuckDB-Wasm**. Search, filters, sorting, the dashboard, orphan rules, related resources and export all run there as SQL, with no further Azure calls.
- The DuckDB engine (about 36 MB) is downloaded from [jsDelivr](https://www.jsdelivr.com/package/npm/@duckdb/duckdb-wasm) the first time you select a subscription, pinned to the version azure-lupa was built with, and then cached by the browser. This needs internet access to `cdn.jsdelivr.net`; DuckDB never fetches extensions.
- Resource details come from ARM, using the newest stable API version of the resource's provider.
- Responses are cached in `~/.azure-lupa/cache` (15 minutes by default), so reopening the app is instant. **Refresh** fetches the current tenant again.
- Azure calls are limited to 4 concurrent requests and retry on throttling (`429`), honoring `Retry-After`.

## Options

```
-p, --port <port>        port to listen on (default 4517, next free port if taken)
    --no-open            do not open the browser
    --cache-ttl <min>    cache lifetime in minutes (default 15)
    --clear-cache        delete the local cache before starting
-v, --verbose            log Azure calls and cache hits
```

## Icons

Resource type icons come from [`@threeveloper/azure-react-icons`](https://www.npmjs.com/package/@threeveloper/azure-react-icons), which packages Microsoft's [Azure architecture icons](https://learn.microsoft.com/azure/architecture/icons/). The icons remain subject to Microsoft's terms of use.

## Security

The server only listens on `127.0.0.1`, rejects requests addressed to any other host name, and requires a random per-session token (passed in the URL it opens). It never writes to Azure.

Found a vulnerability? Please report it privately through [GitHub security advisories](https://github.com/rafaelherik/azure-lupa/security/advisories/new) rather than opening a public issue.

## Contributing

Contributions are welcome: bug reports, ideas, docs and code. Read [CONTRIBUTING.md](CONTRIBUTING.md) to get set up. Commits and PR titles follow [Conventional Commits](https://www.conventionalcommits.org).

## Development

```sh
npm install
pre-commit install   # lint, format and commit-message hooks (https://pre-commit.com)
npm run dev          # API on :4517 (token "dev") + Vite on :5173 → open http://localhost:5173/#token=dev
npm test             # unit tests
npm run lint         # oxlint
npm run format       # Prettier
npm run build        # type-check, build the web app and the server bundle
```

With [Task](https://taskfile.dev) installed, `task dev`, `task test`, `task lint` and `task build` do the same (and install dependencies first if needed). Run `task` to list all tasks.

## Releasing

1. Label PRs (`feature`, `fix`, `chore`, `docs`, `breaking`, …), or let the autolabeler do it from the branch name or the conventional PR title.
2. Each merge to `main` updates a **draft** GitHub release. Its version comes from the labels: `breaking` → major, `feature` → minor, everything else → patch.
3. When you're ready, review the draft and click **Publish release**. That runs `.github/workflows/release.yml`, which sets `package.json` to the tag's version and **stages** it on npm with provenance, through npm trusted publishing (no tokens or secrets).
4. Approve the staged version with 2FA to make it public. The workflow run's summary shows the commands:

   ```sh
   npm stage list azure-lupa
   npm stage approve <stage-id>
   ```

   Releases marked as pre-release are staged under the `next` tag instead of `latest`.

## License

[MIT](LICENSE) © Rafael Herik
