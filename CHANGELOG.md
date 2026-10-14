# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [0.0.1] - 2026-10-14

First release.

### Added

- Browse **tenants → subscriptions → resource groups** for every tenant your `az login` can reach.
- A resource table for one or more subscriptions, with **search**, **type, location, resource group and tag filters**, and sortable columns. `⌘` / `Ctrl` + click combines subscriptions in one view.
- Each scope is loaded once from Azure Resource Graph into an in-browser **DuckDB** database. Filtering, sorting, the dashboard and export then run locally, with no further Azure calls.
- **Orphan detection**: 21 rules based on the [Azure Orphaned Resources workbook](https://github.com/dolevshor/azure-orphan-resources), such as unattached disks, unassociated public IPs, NICs and NSGs, empty App Service plans and VNet gateways without connections, plus empty resource groups. Flagged resources show a badge, can be filtered with **Orphans**, are summarized on the dashboard, and the details panel explains each flag and links to Microsoft Learn.
- A **details panel** with essentials, **related resources** (parent, children, what it uses and what uses it), tags, a property tree with clickable resource IDs, and raw JSON. You can copy the ID or open the resource in the Azure Portal.
- A **dashboard** of counts by type, location, subscription and resource group; select a bar to drill in.
- **Azure service icons** for about 90 common resource types.
- **Export** of the current view to CSV or JSON, including an orphan column.
- A local disk cache (`~/.azure-lupa/cache`, 15 minutes by default) and a **Refresh** action.
- Azure calls are limited to 4 at a time and retry on throttling (`429`), honoring `Retry-After`.
- Read-only by design: the server only listens on `127.0.0.1`, rejects other hosts, and requires a per-session token.

### Requirements

- Node.js 24+
- [Azure CLI](https://aka.ms/azure-cli), signed in with `az login`
- **Reader** access to the subscriptions you want to see

### Notes

- The DuckDB engine (about 36 MB) is downloaded from `cdn.jsdelivr.net` the first time you select a subscription, then cached by the browser. This needs internet access to that host.
- Orphan flags are heuristics. Confirm before deleting anything. The API connection rule only sees Consumption Logic Apps, so connections used only by Standard Logic Apps are flagged.

[0.0.1]: https://github.com/rafaelherik/azure-lupa/releases/tag/v0.0.1
