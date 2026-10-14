---
version: 1
slug: "src-web"
primary_target: "src/web"
related_targets: []
---

# Surface: azure-lupa app shell (Resources, Dashboard, Details)

Mode: Operate. Users: cloud/platform engineers auditing many tenants/subscriptions. Task: find resources fast, filter, drill down, export.

## Direction contract

THESIS: The category standard, done at Azure Portal (modern Fluent) craft: a calm, dense, keyboard-first explorer. Refuses novelty theming; refuses the Portal's slow blade-stacking by using one table and one details drawer.

OWN-WORLD: White content ground, slate-50 sidebar and table header, slate ink, one blue accent (#2563eb) only for selection, focus and actions; system sans stack, ui-monospace for types/IDs; 6px radii, 1px slate-200 hairlines, no shadows except overlays. Dark theme mirrors it on slate-950.

STORY: The engineer opens a tenant, picks subscriptions, sees counts instantly from cache, narrows with search and chips, opens a resource, copies its ID or jumps to the Portal, exports the list.

FIRST VIEWPORT: 272px sidebar tree (tenants → subscriptions → RGs with counts, needs-sign-in card with az login command). Main: tab bar (Resources/Dashboard) with cache age + Refresh at right; toolbar with 320px search (/ hint), dashed filter chips, Export menu right; full-height sticky-header table, 30px rows; footer with totals and keyboard hints.

FORM: canon card (category standard), chosen over the assigned Concourse Signage; seed key 9b994c8a.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
