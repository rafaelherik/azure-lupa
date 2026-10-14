# azure-lupa

A local, read-only Azure inventory explorer that uses your existing Azure CLI login.

```sh
npx azure-lupa
```

It starts a small server on `127.0.0.1`, opens your browser, and lets you:

- browse **tenants → subscriptions → resource groups**
- list every resource in one or more subscriptions, with **search**, **type / location / resource group / tag filters** and sortable columns
- open a resource to see its **essentials, tags, property tree and raw JSON**, copy its ID, or jump to the Azure Portal
- see a **dashboard** of counts by type, location, subscription and resource group (select a bar to drill in)
- **export** the current view to CSV or JSON

Keyboard: `/` search · `j` / `k` move · `Enter` details · `Esc` close · `⌘`/`Ctrl`-click subscriptions to combine them.

## Requirements

- Node.js 20+
- [Azure CLI](https://aka.ms/azure-cli), signed in with `az login`
- **Reader** access on what you want to see

Tenants that need their own sign-in (MFA or conditional access) show the exact command to run, e.g. `az login --tenant <id>`.

## How it loads data

- Nothing is fetched until you open it: subscriptions load when you expand a tenant, resources when you select a subscription.
- Resources come from **Azure Resource Graph**, scoped to the selected subscriptions, filtered server-side and paged 500 at a time as you scroll.
- Resource details come from ARM, using the newest stable API version of the resource's provider.
- Responses are cached in `~/.azure-lupa/cache` (15 minutes by default), so reopening the app is instant. **Refresh** re-fetches the current tenant.
- Azure calls are limited to 4 concurrent requests and retry on throttling (`429`), honoring `Retry-After`.

## Options

```
-p, --port <port>        port to listen on (default 4517, next free port if taken)
    --no-open            do not open the browser
    --cache-ttl <min>    cache lifetime in minutes (default 15)
    --clear-cache        delete the local cache before starting
-v, --verbose            log Azure calls and cache hits
```

## Security

The server only listens on `127.0.0.1`, rejects requests addressed to any other host name, and requires a random per-session token (passed in the URL it opens). It never writes to Azure.

## Development

```sh
npm install
npm run dev      # API on :4517 (token "dev") + Vite on :5173 → open http://localhost:5173/#token=dev
npm test         # unit tests
npm run build    # type-check, build the web app and the server bundle
```
