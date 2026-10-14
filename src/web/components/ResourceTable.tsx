import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, SearchX } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ResourceRow, SortField } from "../../shared/types";
import { RequestError } from "../lib/api";
import { nf, providerOf, typeWithinProvider } from "../lib/format";
import { iconForType } from "../lib/icons";
import type { Sort } from "../lib/queries";
import { useResources, type Scope } from "../lib/queries";
import { hasFilters, useViewState } from "../lib/state";
import { Button, Skeleton } from "./ui";

interface Column {
  id: string;
  label: string;
  width: string;
  sort?: SortField;
  cell: (r: ResourceRow) => React.ReactNode;
  title?: (r: ResourceRow) => string;
}

const ROW_HEIGHT = 30;

function Tags({ tags }: { tags?: Record<string, string> }) {
  const entries = Object.entries(tags ?? {});
  if (!entries.length) return <span className="text-faint">—</span>;
  return (
    <>
      <span className="mr-1 inline-block max-w-[calc(100%-36px)] truncate rounded bg-hover px-1.5 align-middle text-[11px] leading-[18px] text-ink-2">
        {entries[0]![0]}={entries[0]![1]}
      </span>
      {entries.length > 1 && (
        <span className="inline-block rounded border border-line px-1 align-middle text-[11px] leading-4 text-muted">
          +{entries.length - 1}
        </span>
      )}
    </>
  );
}

let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(text: string, font: string) {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 7;
  // Canvas rejects vendor keywords like -apple-system and would silently measure in its 10px default.
  measureCtx.font = font.replace(/-apple-system,?\s*|BlinkMacSystemFont,?\s*/g, "");
  return measureCtx.measureText(text).width;
}

/**
 * Keeps both ends of long names visible: "rg-pc-gdp-sa…-tags-02-dev". The head is cut at a whole
 * character measured against the available width, so letters are never sliced.
 */
export function MiddleTruncate({ text, tail = 12, className }: { text: string; tail?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(text);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const cs = getComputedStyle(el);
      const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const max = el.clientWidth;
      if (!max || textWidth(text, font) <= max) return setShown(text);
      const end = text.slice(-tail);
      let lo = 0;
      let hi = text.length - tail;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (textWidth(text.slice(0, mid) + "…" + end, font) <= max) lo = mid;
        else hi = mid - 1;
      }
      setShown(text.slice(0, lo) + "…" + end);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, tail]);
  return (
    <span ref={ref} title={text} className={clsx("block min-w-0 flex-1 overflow-hidden whitespace-nowrap", className)}>
      {shown}
    </span>
  );
}

function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

export function ResourceTable({
  scope,
  sort,
  subscriptionNames,
}: {
  scope: Scope;
  sort: Sort;
  subscriptionNames: Map<string, string>;
}) {
  const [state, update] = useViewState();
  const query = useResources(scope, state.filters, sort);
  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.data.rows) ?? [], [query.data]);
  const total = query.data?.pages[0]?.data.totalRecords ?? 0;
  const scrollRef = useRef<HTMLDivElement>(null);

  const multiSub = scope.subscriptionIds.length > 1;
  const narrow = useMedia("(max-width: 639px)");
  // With the details panel open, low-priority columns drop instead of being cut at the panel edge.
  const compact = Boolean(state.selectedId);
  const rowHeight = narrow ? 52 : ROW_HEIGHT;
  const columns = useMemo<Column[]>(() => {
    const nameCell = (r: ResourceRow) => {
      const Icon = iconForType(r.type);
      return (
        <span className="flex min-w-0 items-center gap-2">
          <Icon aria-hidden className="size-3.5 shrink-0 text-muted" />
          <span className="name truncate font-medium text-ink">{r.name}</span>
        </span>
      );
    };
    const typeCell = (r: ResourceRow) => (
      <span className="font-mono text-[12px]">
        <span className="text-ink-2">{typeWithinProvider(r.type)}</span>
        <span className="ml-1.5 text-faint">{providerOf(r.type).replace(/^microsoft\./, "")}</span>
      </span>
    );
    if (narrow) {
      return [
        {
          id: "name",
          label: "Resource",
          width: "minmax(0, 1fr)",
          sort: "name",
          cell: (r) => (
            <span className="block min-w-0">
              {nameCell(r)}
              <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5 pl-5.5 text-[12px] text-muted">
                <span className="shrink-0 font-mono">{typeWithinProvider(r.type)}</span>
                <span className="text-faint">·</span>
                <MiddleTruncate text={r.resourceGroup} tail={10} />
              </span>
            </span>
          ),
          title: (r) => `${r.name}\n${r.type}\n${r.resourceGroup}`,
        },
      ];
    }
    return [
      { id: "name", label: "Name", width: "minmax(200px, 1.3fr)", sort: "name", cell: nameCell, title: (r) => r.name },
      { id: "type", label: "Type", width: "minmax(180px, 1fr)", sort: "type", cell: typeCell, title: (r) => r.type },
      {
        id: "rg",
        label: "Resource group",
        width: "minmax(200px, 1.3fr)",
        sort: "resourceGroup",
        cell: (r) => <MiddleTruncate text={r.resourceGroup} />,
        title: (r) => r.resourceGroup,
      },
      ...(multiSub
        ? [
            {
              id: "sub",
              label: "Subscription",
              width: "minmax(140px, 0.9fr)",
              sort: "subscriptionId" as const,
              cell: (r: ResourceRow) => subscriptionNames.get(r.subscriptionId) ?? r.subscriptionId,
              title: (r: ResourceRow) => r.subscriptionId,
            },
          ]
        : []),
      {
        id: "location",
        label: "Location",
        width: "110px",
        sort: "location",
        cell: (r) => r.location || <span className="text-faint">—</span>,
      },
      ...(compact
        ? []
        : [
            {
              id: "sku",
              label: "SKU",
              width: "120px",
              cell: (r: ResourceRow) => r.sku || <span className="text-faint">—</span>,
              title: (r: ResourceRow) => r.sku ?? "",
            },
            {
              id: "tags",
              label: "Tags",
              width: "minmax(150px, 0.8fr)",
              cell: (r: ResourceRow) => <Tags tags={r.tags} />,
              title: (r: ResourceRow) =>
                Object.entries(r.tags ?? {})
                  .map(([k, v]) => `${k}=${v}`)
                  .join("\n"),
            },
          ]),
    ];
  }, [multiSub, subscriptionNames, narrow, compact]);
  const grid = columns.map((c) => c.width).join(" ");

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });
  const items = virtualizer.getVirtualItems();
  const lastIndex = items.at(-1)?.index ?? 0;

  useEffect(() => {
    if (query.hasNextPage && !query.isFetchingNextPage && lastIndex >= rows.length - 40) void query.fetchNextPage();
  }, [lastIndex, rows.length, query]);

  // Scroll back to the top when the result set changes.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [scope.tenantId, scope.subscriptionIds, state.filters, sort]);

  const onSort = (field: SortField) =>
    update(
      { sort: sort.field === field ? { field, dir: sort.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" } },
      { replace: true },
    );

  if (query.error) return <TableError error={query.error} onRetry={() => void query.refetch()} />;

  const selected = state.selectedId?.toLowerCase();

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto"
        role="grid"
        aria-rowcount={total}
        aria-busy={query.isFetching}
      >
        <div className={narrow ? "" : compact ? "min-w-[720px]" : "min-w-[960px]"}>
          <div
            role="row"
            className="sticky top-0 z-10 grid h-9 border-b border-line bg-panel"
            style={{ gridTemplateColumns: grid }}
          >
            {columns.map((c, i) => {
              const active = c.sort && sort.field === c.sort;
              const Arrow = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <div
                  key={c.id}
                  role="columnheader"
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={clsx(
                    "flex items-center px-3 text-[12px] font-medium",
                    i === 0 && "pl-4 md:pl-6",
                    active ? "text-ink" : "text-muted",
                  )}
                >
                  {c.sort ? (
                    <button
                      type="button"
                      onClick={() => onSort(c.sort!)}
                      className="group inline-flex items-center gap-1 hover:text-ink"
                    >
                      {c.label}
                      <Arrow
                        className={clsx("size-3", active ? "text-ink" : "text-faint opacity-0 group-hover:opacity-100")}
                      />
                    </button>
                  ) : (
                    c.label
                  )}
                </div>
              );
            })}
          </div>

          {query.isPending && <LoadingRows grid={grid} cols={columns.length} />}

          {!query.isPending && rows.length === 0 && (
            <EmptyResult
              filtered={hasFilters(state.filters)}
              onClear={() => update({ filters: {} }, { replace: true })}
            />
          )}

          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {items.map((item) => {
              const r = rows[item.index]!;
              const isSelected = selected === r.id.toLowerCase();
              return (
                <div
                  key={r.id}
                  role="row"
                  aria-selected={isSelected}
                  onClick={() => update({ selectedId: isSelected ? undefined : r.id }, { replace: true })}
                  className={clsx(
                    "absolute inset-x-0 grid cursor-default border-b border-line-soft text-[13px] text-ink-2",
                    isSelected ? "bg-accent-soft [&_.name]:text-accent-ink" : "hover:bg-hover",
                  )}
                  style={{ gridTemplateColumns: grid, height: rowHeight, transform: `translateY(${item.start}px)` }}
                >
                  {columns.map((c, i) => (
                    <div
                      key={c.id}
                      role="gridcell"
                      title={c.title?.(r)}
                      className={clsx("flex min-w-0 items-center truncate px-3", i === 0 && "pl-4 md:pl-6")}
                    >
                      <div className="min-w-0 flex-1 truncate">{c.cell(r)}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <footer className="flex h-10 shrink-0 items-center gap-4 border-t border-line bg-panel px-4 text-[12px] text-muted md:px-6">
        <span>
          <b className="font-semibold text-ink">{nf.format(total)}</b> resources ·{" "}
          <b className="font-semibold text-ink">{scope.subscriptionIds.length}</b>{" "}
          {scope.subscriptionIds.length === 1 ? "subscription" : "subscriptions"}
        </span>
        {rows.length < total && (
          <span>
            {nf.format(rows.length)} loaded{query.isFetchingNextPage ? ", loading more…" : ""}
          </span>
        )}
      </footer>
    </div>
  );
}

function LoadingRows({ grid, cols }: { grid: string; cols: number }) {
  return (
    <div aria-label="Loading resources">
      {Array.from({ length: 14 }, (_, i) => (
        <div
          key={i}
          className="grid h-[30px] items-center border-b border-line-soft"
          style={{ gridTemplateColumns: grid }}
        >
          {Array.from({ length: cols }, (_, j) => (
            <div key={j} className={clsx("px-3", j === 0 && "pl-4 md:pl-6")}>
              <Skeleton className={clsx(j === 0 ? "w-3/4" : j % 2 ? "w-2/3" : "w-1/2")} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function EmptyResult({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <SearchX className="size-6 text-faint" />
      <p className="mt-3 text-[14px] font-medium text-ink">
        {filtered ? "No resources match these filters" : "This scope has no resources"}
      </p>
      <p className="mt-1 max-w-sm text-[13px] text-muted">
        {filtered
          ? "Filters combine with AND. Remove one, or clear them all to see everything in scope."
          : "Resource groups can be empty. Pick another subscription in the sidebar."}
      </p>
      {filtered && (
        <Button className="mt-4" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

export function TableError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const e = error instanceof RequestError ? error : undefined;
  const throttled = e?.status === 429;
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <AlertTriangle className="size-6 text-danger" />
      <p className="mt-3 text-[14px] font-medium text-ink">
        {throttled ? "Azure is throttling requests" : "Could not load resources"}
      </p>
      <p className="mt-1 max-w-md text-[13px] text-muted">
        {throttled
          ? "Too many requests in a short time. Wait a few seconds and retry; cached views keep working."
          : error.message}
      </p>
      {e?.hint && <code className="mt-3 rounded bg-hover px-2 py-1 font-mono text-[12px] text-ink">{e.hint}</code>}
      <Button className="mt-4" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
