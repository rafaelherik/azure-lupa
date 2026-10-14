---
name: azure-lupa
description: A calm, dense Azure inventory explorer in the category standard.
colors:
  bg: "#ffffff"
  panel: "#f8fafc"
  raised: "#ffffff"
  hover: "#f1f5f9"
  line: "#e2e8f0"
  line-soft: "#f1f5f9"
  ink: "#0f172a"
  ink-2: "#334155"
  muted: "#526077"
  faint: "#64748b"
  accent: "#2563eb"
  accent-ink: "#1d4ed8"
  accent-soft: "#eff6ff"
  accent-line: "#bfdbfe"
  ring: "#bfdbfe"
  danger: "#b91c1c"
  danger-soft: "#fef2f2"
  warn: "#b45309"
  warn-soft: "#fffbeb"
  ok: "#15803d"
  dark-bg: "#020617"
  dark-panel: "#0f172a"
  dark-raised: "#0b1324"
  dark-hover: "#1a2540"
  dark-line: "#1e293b"
  dark-line-soft: "#162033"
  dark-ink: "#e2e8f0"
  dark-ink-2: "#cbd5e1"
  dark-muted: "#94a3b8"
  dark-faint: "#7c8aa0"
  dark-accent: "#60a5fa"
  dark-accent-ink: "#93c5fd"
  dark-accent-soft: "#172554"
  dark-accent-line: "#1e3a8a"
  dark-ring: "#1e40af"
  dark-danger: "#f87171"
  dark-danger-soft: "#2a1215"
  dark-warn: "#fbbf24"
  dark-warn-soft: "#2a1f0a"
  dark-ok: "#4ade80"
typography:
  headline:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 600
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "24px"
  section:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: "20px"
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
    fontFeature: "tnum"
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "20px"
  caption:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 500
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, 'Cascadia Mono', Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
components:
  button-default:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-default-hover:
    backgroundColor: "{colors.hover}"
  button-default-active:
    backgroundColor: "{colors.line}"
  button-small:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "28px"
  button-ghost:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "28px"
  button-ghost-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.ink}"
  icon-button:
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    size: "28px"
  icon-button-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.ink}"
  input-search:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 32px"
    height: "32px"
    width: "320px"
  input-compact:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "28px"
  filter-chip:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  filter-chip-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
  tab:
    textColor: "{colors.muted}"
    typography: "{typography.section}"
  tab-active:
    textColor: "{colors.ink}"
  table-header:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    height: "36px"
  table-row:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink-2}"
    typography: "{typography.body}"
    height: "30px"
  table-row-hover:
    backgroundColor: "{colors.hover}"
  table-row-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
  table-row-stacked:
    height: "52px"
  table-footer:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    height: "40px"
  tree-row:
    textColor: "{colors.ink-2}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: "28px"
  tree-row-in-scope:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
  tree-row-filtered:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
  sidebar:
    backgroundColor: "{colors.panel}"
    width: "272px"
  details-panel:
    backgroundColor: "{colors.bg}"
    width: "460px"
  popover:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.lg}"
  card:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.lg}"
  tag:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.ink-2}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "0 6px"
    height: "18px"
  logo-mark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
    rounded: "{rounded.md}"
    size: "24px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
---

# Design System: azure-lupa

## Overview

**Creative North Star: "The Quiet Console"**

azure-lupa is the category standard for cloud inventory, built to modern Azure Portal (Fluent) craft and then made faster: one table, one details drawer, no blade stacking. The screen is white ground and slate ink, divided by 1px hairlines, with one blue reserved for what the engineer is acting on. Nothing decorates. Density is high (30px rows, 13px body) but every row stays legible, and every machine string (types, IDs, API versions, CLI commands) is set in monospace so it reads as data.

The shell is three fixed regions: a 272px slate-50 sidebar tree (tenants, subscriptions, resource groups with counts), a main column (56px tab bar with breadcrumb and cache age, toolbar of search and filter chips, sticky-header table, totals footer), and an optional 460px details drawer at the right. The dark theme mirrors the light one on slate-950 rather than reinterpreting it.

The world refuses novelty theming: no brand illustration, no gradients, no display type, no colored side stripes. Depth comes from tone and hairlines; shadows exist only on things that float.

**Key Characteristics:**
- White ground, slate-50 chrome (sidebar, table header, footers), slate ink.
- One blue accent for selection, focus and actions; a lighter blue (#60a5fa) carries the same role on the dark ground.
- System UI sans for all text; ui-monospace for machine strings; tabular numerals everywhere.
- 1px slate hairlines as the only structure; overlay shadows only on floating layers.
- 6px controls, 8px floating surfaces, 4px tags.
- Dense: 30px rows, 28 to 32px controls.

## Colors

A cool slate neutral scale with a single Fluent-adjacent blue; status colors appear only as small dots and text.

### Primary
- **Portal Blue** (accent): the action and selection color. Focus outlines, text actions ("Refresh", "Select all N", "Show all"), the resource-group link in the details panel, the caret, checked checkboxes in facet menus, the in-scope activity dot, and Dashboard bars (each bar is a drill-in action, shown at 80% opacity, full on hover).
- **Deep Portal Blue** (accent-ink): blue that reads as text on a soft-blue fill: the selected row's resource name, active filter chips, the filtered resource group in the tree, numbers and booleans in the property tree and JSON view.
- **Selection Wash** (accent-soft): the fill of selected rows, active filter chips, and the filtered resource-group row.
- **Selection Edge** (accent-line): the border of active chips and text selection.
- **Focus Halo** (ring): the 3px focus ring around text inputs.

### Neutral
- **Paper** (bg): the content ground of the main column and details drawer.
- **Slate Mist** (panel): sidebar, sticky table header, table and drawer footers.
- **Raised** (raised): inputs, default buttons, chips, popovers, Dashboard cards, the in-scope subscription row. White in light; a hair above the ground in dark (#0b1324).
- **Hover Wash** (hover): hover fill for rows, tree items and ghost controls; also the resting fill of tags and code hints.
- **Hairline** (line): every structural border; also the pressed fill of buttons.
- **Soft Hairline** (line-soft): table row dividers and the Dashboard bar track.
- **Slate Ink** (ink): headings, names, active tabs, the logo mark and toast fill.
- **Slate Ink 2** (ink-2): default table cell text and secondary values.
- **Muted Slate** (muted): column headers, labels, helper copy.
- **Faint Slate** (faint): placeholders, counts, em-dash empties, provider suffixes, separators. Holds 4.7:1 on white.

### Status
- **Danger** / **Danger Soft**, **Warn** / **Warn Soft**, **OK**: provisioning state dots and text, "Needs sign-in" (warn), error icons and messages (danger). Status never fills a row or a surface.

### Named Rules
**The One Blue Rule.** Blue marks only what is selected, focused, or actionable. Headings, tabs, icons and borders at rest are slate. The active tab underline is ink, not blue.

**The Lighter Blue in the Dark Rule.** On the dark ground the accent is #60a5fa, not #2563eb, so actions and focus keep contrast; accent-ink lightens to #93c5fd and accent-soft deepens to navy (#172554). Never carry the light-theme blue into dark.

**The Mirror Rule.** Dark theme is the same token set re-valued on slate-950; components never branch on theme, they only read semantic tokens.

## Typography

**Body Font:** system-ui (Segoe UI Variable Text on Windows, SF on macOS, then Roboto, Helvetica, Arial)
**Label/Mono Font:** ui-monospace (SFMono-Regular, Cascadia Mono, Menlo, Consolas)

**Character:** The operating system's own UI face, so the tool feels native beside the terminal and the Portal; monospace marks anything a machine produced. There is no display role.

### Hierarchy
- **Headline** (600, 18px): the empty-state prompt only ("Pick a subscription to start").
- **Title** (600, 15px, 24px): the resource name at the top of the details drawer.
- **Section** (600 or 500, 13px, 20px): card titles, drawer section headings ("Essentials", "Tags"), tab labels (500), the brand name at 14px.
- **Body** (400, 13px, 20px, tabular numerals): table cells, tree rows, detail values, helper paragraphs.
- **Label** (500, 12px): buttons, chips, column headers, footers, breadcrumb, detail field names (400).
- **Caption** (500 or 400, 11px): counts in the tree, tag pills, the "read-only" badge, `kbd` keys (500, 11px, 16px, mono).
- **Mono** (400, 12px; 11px for full resource IDs, subscription IDs and CLI commands): resource types, provider suffixes, API versions, IDs, JSON, tag-filter input.

### Named Rules
**The Machine-String Rule.** If Azure or the CLI produced the string (type, ID, API version, command, JSON), it is set in mono. Human names stay in sans.

**The Numbers Line Up Rule.** Tabular numerals are on globally; counts align in every column and tree.

## Layout

Full-height app shell, no page scroll; each region scrolls on its own.

- **Sidebar:** 272px at 1024px and up, static. Below 1024px it becomes a 288px off-canvas drawer that slides in over a 20% ink scrim (200ms transform) with the overlay shadow.
- **Top bar:** 56px, bottom hairline. Tabs (Resources, Dashboard) with 20px gaps, then the tenant / scope breadcrumb (from 768px), a flexible gap, cache age with a status dot and a "Refresh" text action, and the theme toggle (system, light, dark).
- **Toolbar:** at least 56px, wraps; 320px search (full width below 640px), filter chips, "Clear filters", Export pushed right. 8px gaps.
- **Table:** sticky 36px header, 30px rows, 40px totals footer. Minimum grid width 960px; 720px with the details panel open.
- **Details drawer:** 460px inline at 1024px and up; below that it covers the table area full width.
- **Dashboard:** max 1400px, 20px top padding, cards in two columns from 1280px (type list left, location / subscription / resource group stacked right).
- **Horizontal padding:** 16px, 24px from 768px. The first table column aligns to that padding.
- **Rhythm:** a 4px grid; control heights are 28px (compact) and 32px (default); tree rows 28px.

### Named Rules
**The Drop, Don't Clip Rule.** When space shrinks, the table sheds information instead of cutting it at an edge: with the details panel open the SKU and Tags columns drop; below 640px each row becomes a 52px stacked single column (name, then type and resource group); long resource-group names are middle-truncated by measurement so both ends stay readable, with the full name in the tooltip.

## Elevation & Depth

Flat by default. Depth is tonal (paper ground, slate-50 chrome, raised white controls) and drawn with 1px hairlines. Shadows appear only on layers that float above the page: popovers, the mobile sidebar drawer, and the toast. A 1px ring drawn with box-shadow is treated as a border, not elevation (the in-scope subscription row).

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 8px 24px -6px rgb(15 23 42 / 0.16), 0 2px 6px -2px rgb(15 23 42 / 0.08)`; dark `0 8px 24px -6px rgb(0 0 0 / 0.5), 0 2px 6px -2px rgb(0 0 0 / 0.4)`): popovers and menus, the off-canvas sidebar, the toast.

### Named Rules
**The Only Floaters Cast Shadows Rule.** Cards, panels, rows and buttons at rest have no shadow. If it does not float over other content, it does not cast one.

## Shapes

Gently rounded and consistent. Controls, tree rows, the logo mark and the toast use 6px; floating surfaces and Dashboard cards use 8px; tags, badges, `kbd`, code hints and the focus outline use 4px; checkboxes 3px; status dots are full circles. Borders are 1px solid hairlines. Dashed 1px borders in faint slate mean "something to add or do": unapplied filter chips and the needs-sign-in card. Dashboard bars round only their trailing end.

## Components

### Buttons
Quiet, compact, bordered.
- **Shape:** gently rounded (6px).
- **Default:** raised fill, 1px hairline, ink 12px/500 label, 32px tall with 12px side padding; small size 28px with 8px. Icons 14px with 6px gap.
- **Hover / Active:** hover wash, then hairline fill on press; 150ms color transition. Disabled at 50% opacity.
- **Ghost:** no border, muted text; hover wash and ink text ("Clear filters").
- **Icon button:** 28px square, muted glyph (16px), hover wash; always carries a label and tooltip.
- **Text action:** accent 12/13px medium text with underline on hover ("Refresh", "Select all N", "Show all"). This is the system's call-to-action form; there is no filled button in the shipped surfaces.

### Chips (filter)
- **Unapplied:** 32px, raised fill, 1px dashed faint border, ink-2 12px/500, leading plus glyph.
- **Applied:** accent-soft fill, solid accent-line border, accent-ink label "Type: storageaccounts +1", trailing remove button.
- Opening a chip shows a 320px popover with a filter input and a multi-select list of values with counts.

### Inputs / Fields
- **Style:** raised fill, 1px hairline, 6px radius; search is 32px tall with a leading 16px search glyph and a `/` key hint; compact inputs are 28px.
- **Focus:** border turns accent and a 3px ring-colored halo appears. Global focus-visible is a 2px accent outline at 1px offset.
- **Placeholder:** faint.

### Navigation (sidebar tree)
- **Header:** 56px with the ink logo mark (24px, 6px radius, bg-colored magnifier glyph), "azure-lupa" at 14px/600, and a "read-only" badge.
- **Section header:** "Tenants" in 11px/600 uppercase muted with wide tracking, count at right. This is the only uppercase text in the system.
- **Rows:** 28px, 6px radius, hover wash. Tenants 600 weight with a rotating chevron (150ms); subscriptions indented 40px; resource groups indented 56px at 12px muted, middle-truncated.
- **States:** the in-scope subscription sits on raised fill with a 1px hairline ring and ink text, its count in accent-ink; the filtered resource group takes accent-soft fill and accent-ink text; a 6px accent dot marks the subscription and group holding the selected resource.
- **Tenant needing sign-in:** "Needs sign-in" in warn, with a dashed card holding a copyable mono `az login --tenant` command.
- **Footer:** 40px hint "⌘ or Ctrl click to combine subscriptions".

### Tabs
Text tabs with a 2px ink underline on the active item; inactive muted, ink on hover. Used in the top bar and the details drawer (Overview, Properties, JSON).

### Resource Table (signature)
- Sticky slate-50 header, 12px/500 muted labels; sortable headers show an arrow on hover and keep it in ink when active.
- 30px rows, soft-hairline dividers, ink-2 text; the name cell has a 14px type icon in muted and a medium ink name.
- Type cell in mono: the type in ink-2, then the provider in faint.
- **Selected row:** accent-soft fill plus an accent-ink name. No side stripe, no border change.
- Empty values are a faint em dash. Tags show the first pair as a tag pill plus a "+N" outlined counter.
- Loading is 14 shimmer skeleton rows; empty and error states center a 24px icon, a 14px/500 heading, a muted explanation and a default button.

### Details Drawer
- Slides in 16px from the right with a fade (180ms, cubic-bezier(0.16, 1, 0.3, 1)); hairline left border.
- Header: 32px bordered icon tile on panel, 15px/600 name, mono type, close icon button; "Copy ID" and "Open in Azure Portal" as small default buttons; tabs.
- Essentials as a 132px label column (12px muted) and value column (13px ink); the resource group is an accent link that filters the table; provisioning state shows a status dot.
- Tags as clickable 4px pills (key muted, "=" faint, value ink) that add a tag filter.
- Footer on panel: cache age, API version, "Refresh".

### Cards / Containers (Dashboard)
- **Corner Style:** 8px.
- **Background:** raised, 1px hairline, no shadow.
- **Header:** 44px with a 13px/600 title and a muted group count, divided by a hairline.
- **Bar rows:** label (with optional mono faint secondary), an 8px accent bar on a soft-hairline track, and a right-aligned count; the whole row is a drill-in button.

### Tags and Badges
4px radius, hover-wash fill, 11 to 12px text, 18 to 22px tall. Outline variant (hairline border, muted) for counters and the "read-only" badge.

### Toast
Ink fill, bg-colored 12px/500 text, 6px radius, overlay shadow, centered 56px above the bottom; confirms copies.

### Motion
Color changes 150ms (100ms on tree rows); chevrons rotate 150ms; sidebar drawer 200ms; details drawer entrance 180ms ease-out-expo; skeleton shimmer 1.2s linear. All entrance and shimmer animation stops under reduced motion.

## Do's and Don'ts

### Do:
- **Do** use accent only for selection, focus and actions, and switch to the lighter dark-theme blue (#60a5fa) on the dark ground.
- **Do** show selection as accent-soft fill with accent-ink text.
- **Do** set every machine string (types, IDs, API versions, CLI commands, JSON) in mono.
- **Do** drop low-priority columns, stack rows below 640px, or middle-truncate long names before letting content clip at an edge.
- **Do** separate regions with 1px hairlines and tone (paper, slate-50, raised) rather than shadows.
- **Do** keep controls at 28px or 32px and rows at 30px; keep the 4px spacing grid.
- **Do** set modifier keys in `kbd` (for example `⌘` / `Ctrl`) (11px mono, hairline border, 4px radius).
- **Do** use dashed faint borders only for things the user can add or must do (unapplied filters, sign-in needed).

### Don't:
- **Don't** mark selection with a colored side stripe or a thicker border.
- **Don't** use blue for headings, tab underlines, resting icons or decoration.
- **Don't** put drop shadows on resting surfaces (cards, panels, rows, buttons); only popovers, the mobile drawer and the toast cast the overlay shadow.
- **Don't** put white text or glyphs on the accent fill in the dark theme; #60a5fa is too light for white.
- **Don't** add a display typeface, gradients, illustration or themed decoration; the product is the category standard.
- **Don't** introduce uppercase eyebrow or kicker labels above headings; the sidebar's tree section header is the only uppercase text.
- **Don't** clip a column at the details-panel edge; drop it.
