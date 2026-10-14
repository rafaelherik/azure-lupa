import clsx from "clsx";
import { useState } from "react";
import type { CountBucket, ResourceFilters } from "../../shared/types";
import { nf, typeWithinProvider } from "../lib/format";
import { useSummary, type Scope } from "../lib/queries";
import { useViewState } from "../lib/state";
import { TableError } from "./ResourceTable";
import { Skeleton } from "./ui";

const TOP = 10;

export function Dashboard({ scope, subscriptionNames }: { scope: Scope; subscriptionNames: Map<string, string> }) {
  const [state, update] = useViewState();
  const summary = useSummary(scope, state.filters);
  const s = summary.data?.data;

  const drill = (patch: Partial<ResourceFilters>) =>
    update((v) => ({ view: "resources", filters: { ...v.filters, ...patch }, selectedId: undefined }));

  if (summary.error) return <TableError error={summary.error} onRetry={() => void summary.refetch()} />;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-4 py-5 md:px-6">
        <p className="text-[13px] text-muted">
          {s ? (
            <>
              <b className="text-[15px] font-semibold text-ink">{nf.format(s.total)}</b> resources across{" "}
              <b className="font-semibold text-ink">{nf.format(s.byType.length)}</b> types,{" "}
              <b className="font-semibold text-ink">{nf.format(s.byLocation.length)}</b> locations and{" "}
              <b className="font-semibold text-ink">{nf.format(s.byResourceGroup.length)}</b> resource groups. Select a bar to list those resources.
            </>
          ) : (
            <Skeleton className="h-4 w-96" />
          )}
        </p>

        <div className="mt-5 grid items-start gap-4 xl:grid-cols-2">
          <BarList title="By type" data={s?.byType} format={typeWithinProvider} sub={(k) => k.split("/")[0]} onPick={(k) => drill({ types: [k] })} />
          <div className="grid gap-4">
            <BarList title="By location" data={s?.byLocation} format={(k) => k || "global / none"} onPick={(k) => k && drill({ locations: [k] })} />
            <BarList
              title="By subscription"
              data={s?.bySubscription}
              format={(k) => subscriptionNames.get(k) ?? k}
              sub={(k) => (subscriptionNames.has(k) ? k : undefined)}
              onPick={(k) => update({ subscriptionIds: [k], view: "resources", selectedId: undefined })}
            />
            <BarList title="By resource group" data={s?.byResourceGroup} onPick={(k) => drill({ resourceGroups: [k] })} />
          </div>
        </div>
      </div>
    </div>
  );
}

function BarList({
  title,
  data,
  format = (k) => k,
  sub,
  onPick,
}: {
  title: string;
  data?: CountBucket[];
  format?: (k: string) => string;
  sub?: (k: string) => string | undefined;
  onPick: (k: string) => void;
}) {
  const [all, setAll] = useState(false);
  const rows = data ? (all ? data : data.slice(0, TOP)) : [];
  const max = data?.[0]?.count ?? 1;
  const total = data?.reduce((n, b) => n + b.count, 0) ?? 0;

  return (
    <section className="rounded-lg border border-line bg-raised">
      <header className="flex h-11 items-center justify-between border-b border-line px-4">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {data && <span className="text-[12px] text-muted">{nf.format(data.length)} {data.length === 1 ? "group" : "groups"}</span>}
      </header>
      <ol className="p-2">
        {!data &&
          Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_48px] items-center gap-3 px-2 py-2">
              <Skeleton className="w-3/4" />
              <Skeleton className="h-2" />
              <Skeleton className="w-8" />
            </li>
          ))}
        {data?.length === 0 && <li className="px-2 py-4 text-[13px] text-muted">Nothing to show for this scope.</li>}
        {rows.map((b) => {
          const pct = total ? (b.count / total) * 100 : 0;
          const label = format(b.key);
          const secondary = sub?.(b.key);
          return (
            <li key={b.key}>
              <button
                type="button"
                onClick={() => onPick(b.key)}
                title={`${b.key}\n${nf.format(b.count)} resources (${pct.toFixed(1)}%)`}
                className="group grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_48px] items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-hover"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-ink">{label}</span>
                  {secondary && <span className="block truncate font-mono text-[11px] text-faint">{secondary}</span>}
                </span>
                <span className="h-2 rounded-r bg-line-soft" aria-hidden>
                  <span
                    className="block h-full rounded-r bg-accent opacity-80 transition-opacity duration-150 group-hover:opacity-100"
                    style={{ width: `${Math.max(1.5, (b.count / max) * 100)}%` }}
                  />
                </span>
                <span className="text-right text-[13px] font-medium text-ink">{nf.format(b.count)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {data && data.length > TOP && (
        <div className="border-t border-line px-4 py-2">
          <button type="button" onClick={() => setAll((a) => !a)} className={clsx("text-[12px] font-medium text-accent hover:underline")}>
            {all ? "Show top 10" : `Show all ${nf.format(data.length)}`}
          </button>
        </div>
      )}
    </section>
  );
}
