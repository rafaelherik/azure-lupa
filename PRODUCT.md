# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React 19 + Vite + Tailwind v4 SPA served by a local Fastify server; launched with `npx azure-lupa`. Chosen in planning with the user.

## Users

Cloud and platform engineers (consultants, MSP staff, enterprise platform teams) who have Azure CLI access to many tenants and subscriptions. They are auditing what exists, hunting for specific resources, and exporting lists for follow-up work.

## Product Purpose

A local, read-only Azure inventory explorer that reuses the user's `az login` session: list tenants and subscriptions, browse and filter all resources, drill into resource groups and individual resources, see summary counts, and export the current view to CSV/JSON. Success is finding a resource or answering "what do we have where" faster than in the Azure Portal.

## Positioning

Speed. Data loads lazily per subscription and is cached locally, so navigation feels instant.

## Operating Context

Runs on the engineer's desktop on localhost, alongside a terminal where they already use `az`. Tenants that require their own sign-in surface an `az login --tenant <id>` hint rather than failing.

## Capabilities and Constraints

- Read-only; never modifies Azure.
- Data: Azure Resource Graph (scoped to selected subscriptions, paged) and ARM for tenants, subscriptions and resource details.
- Local cache under `~/.azure-lupa/cache` with TTL; manual refresh; throttling-aware.
- Not in v1: cost data.

## Product Principles

1. Fast first: never load more than the user asked to see; show cached data immediately.
2. Dense but legible: many rows per screen, full IDs one click away.
3. Never fail silently: auth and throttling problems explain the exact next command to run.

## Brand Commitments

- Visual direction: the category standard, executed cleanly (chosen 2026-10-13). Quality bar: the modern Azure Portal (Fluent conventions), so Azure users feel at home. No novelty theming.
