import clsx from "clsx";
import { AlertTriangle, ChevronRight, Copy, RefreshCw, Search, TerminalSquare } from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import logoMark from "../../../assets/icon/icon-gradient.svg";
import type { Subscription, Tenant } from "../../shared/types";
import { RequestError } from "../lib/api";
import { nf } from "../lib/format";
import { refreshTenant, useResourceGroups, useSubscriptions, useSummary, useTenants } from "../lib/queries";
import { useViewState } from "../lib/state";
import { copy } from "../lib/toast";
import { MiddleTruncate } from "./ResourceTable";
import { IconButton, Skeleton } from "./ui";

const EXPANDED_KEY = "lupa-expanded";

function useExpanded() {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const toggle = (id: string, value?: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (value ?? !next.has(id)) next.add(id);
      else next.delete(id);
      try {
        localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
      } catch {
        // storage unavailable
      }
      return next;
    });
  return [expanded, toggle] as const;
}

const rowBase =
  "group flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-[13px] transition-colors duration-100 hover:bg-hover";

function Chevron({ open, onClick, className }: { open: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={open ? "Collapse" : "Expand"}
      aria-expanded={open}
      onClick={onClick}
      className={clsx(
        "absolute top-1.5 z-10 grid size-4 place-items-center rounded text-faint hover:text-ink",
        className,
      )}
    >
      <ChevronRight className={clsx("size-3.5 transition-transform duration-150", open && "rotate-90")} />
    </button>
  );
}

export function Sidebar() {
  const tenants = useTenants();
  const [filter, setFilter] = useState("");
  const [expanded, toggle] = useExpanded();
  const [state] = useViewState();

  useEffect(() => {
    if (state.tenantId) toggle(state.tenantId, true);
    // only when the selected tenant changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tenantId]);

  const list = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const all = tenants.data?.data ?? [];
    return f
      ? all.filter((t) => `${t.displayName} ${t.defaultDomain ?? ""} ${t.tenantId}`.toLowerCase().includes(f))
      : all;
  }, [tenants.data, filter]);

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-line bg-panel">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4">
        <img src={logoMark} alt="" className="size-6 shrink-0" />
        <span className="text-[14px] font-semibold">azure-lupa</span>
        <span className="ml-auto rounded border border-line bg-raised px-1.5 text-[11px] font-medium text-muted">
          read-only
        </span>
      </div>

      <div className="px-3 pt-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-2 left-2.5 size-3.5 text-faint" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter tenants"
            className="h-7 w-full rounded-md border border-line bg-raised pr-2 pl-8 text-[12px] text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-ring"
          />
        </label>
      </div>

      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">Tenants</span>
        {tenants.data && <span className="text-[11px] text-faint">{list.length}</span>}
      </div>

      <nav aria-label="Tenants and subscriptions" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {tenants.isPending && (
          <div className="space-y-2.5 px-2 pt-2">
            {[70, 55, 80, 60].map((w) => (
              <Skeleton key={w} className="h-3.5" />
            ))}
          </div>
        )}
        {tenants.error && <TreeError error={tenants.error} />}
        {list.map((t) => (
          <TenantNode key={t.tenantId} tenant={t} open={expanded.has(t.tenantId)} toggle={toggle} expanded={expanded} />
        ))}
        {tenants.data && list.length === 0 && (
          <p className="px-2 pt-2 text-[12px] text-muted">No tenant matches “{filter}”.</p>
        )}
      </nav>

      <div className="flex h-10 shrink-0 items-center justify-between border-t border-line px-4 text-[12px] text-muted">
        <span>⌘ or Ctrl click to combine subscriptions</span>
      </div>
    </aside>
  );
}

function TreeError({ error }: { error: Error }) {
  const hint = error instanceof RequestError ? error.hint : undefined;
  return (
    <div className="mx-2 mt-2 rounded-md border border-line bg-raised p-2.5 text-[12px]">
      <p className="flex items-start gap-1.5 text-danger">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        {error.message}
      </p>
      {hint && <p className="mt-1 text-muted">{hint}</p>}
    </div>
  );
}

function TenantNode({
  tenant,
  open,
  toggle,
  expanded,
}: {
  tenant: Tenant;
  open: boolean;
  toggle: (id: string, v?: boolean) => void;
  expanded: Set<string>;
}) {
  const [state, update] = useViewState();
  const subs = useSubscriptions(tenant.tenantId, open);
  const isScope = state.tenantId === tenant.tenantId;
  const needsLogin = subs.error instanceof RequestError && subs.error.status === 401;

  const selectAll = () => {
    const all = subs.data?.data.filter((s) => s.state === "Enabled").map((s) => s.subscriptionId) ?? [];
    if (all.length) update({ tenantId: tenant.tenantId, subscriptionIds: all, filters: {}, selectedId: undefined });
  };

  return (
    <div className="mt-0.5">
      <button
        type="button"
        onClick={() => toggle(tenant.tenantId)}
        aria-expanded={open}
        className={clsx(rowBase, "pl-1.5 font-semibold", isScope ? "text-ink" : "text-ink-2")}
        title={`${tenant.displayName}\n${tenant.defaultDomain ?? ""}\n${tenant.tenantId}`}
      >
        <ChevronRight
          aria-hidden
          className={clsx("size-3.5 shrink-0 text-faint transition-transform duration-150", open && "rotate-90")}
        />
        <span className="truncate">{tenant.displayName}</span>
        {needsLogin && <span className="ml-auto shrink-0 text-[11px] font-medium text-warn">Needs sign-in</span>}
        {!needsLogin && subs.data && (
          <span className="ml-auto shrink-0 text-[11px] font-normal text-faint">{subs.data.data.length}</span>
        )}
      </button>

      {open && (
        <div>
          {subs.isPending && (
            <div className="space-y-2 py-1.5 pl-7">
              <Skeleton className="w-4/5" />
              <Skeleton className="w-3/5" />
            </div>
          )}
          {needsLogin && <SignInCard tenantId={tenant.tenantId} />}
          {subs.error && !needsLogin && <TreeError error={subs.error} />}
          {subs.data && subs.data.data.length === 0 && (
            <p className="py-1 pl-7 text-[12px] text-muted">No subscriptions you can read.</p>
          )}
          {subs.data && subs.data.data.length > 1 && (
            <div className="flex items-center gap-1 py-0.5 pl-6">
              <button
                type="button"
                onClick={selectAll}
                className="rounded px-1 text-[12px] text-accent hover:underline"
              >
                Select all {subs.data.data.length}
              </button>
              <span className="flex-1" />
              <IconButton label="Refresh this tenant" className="size-6" onClick={() => refreshTenant(tenant.tenantId)}>
                <RefreshCw className={clsx("size-3", subs.isFetching && "animate-spin")} />
              </IconButton>
            </div>
          )}
          {subs.data?.data.map((s) => (
            <SubscriptionNode key={s.subscriptionId} sub={s} open={expanded.has(s.subscriptionId)} toggle={toggle} />
          ))}
        </div>
      )}
    </div>
  );
}

function SignInCard({ tenantId }: { tenantId: string }) {
  const cmd = `az login --tenant ${tenantId}`;
  return (
    <div className="my-1 mr-1 ml-6 rounded-md border border-dashed border-faint bg-raised p-2.5">
      <p className="mb-1.5 text-[12px] text-muted">
        This tenant needs its own sign-in. Run in your terminal, then refresh:
      </p>
      <button
        type="button"
        onClick={() => copy(cmd, "Command copied")}
        className="group flex w-full items-center gap-1.5 rounded bg-hover px-1.5 py-1 text-left font-mono text-[11px] text-ink"
        title="Copy command"
      >
        <TerminalSquare className="size-3 shrink-0 text-faint" />
        <span className="truncate">{cmd}</span>
        <Copy className="ml-auto size-3 shrink-0 text-faint group-hover:text-ink" />
      </button>
    </div>
  );
}

function SubscriptionNode({
  sub,
  open,
  toggle,
}: {
  sub: Subscription;
  open: boolean;
  toggle: (id: string, v?: boolean) => void;
}) {
  const [state, update] = useViewState();
  const rgs = useResourceGroups(sub.tenantId, sub.subscriptionId, open);
  const scopeSummary = useSummary({ tenantId: state.tenantId, subscriptionIds: state.subscriptionIds });
  const inScope = state.tenantId === sub.tenantId && state.subscriptionIds.includes(sub.subscriptionId);
  const selectedResourceSub = state.selectedId?.toLowerCase().split("/")[2];
  const holdsSelection = selectedResourceSub === sub.subscriptionId.toLowerCase();
  const disabled = sub.state !== "Enabled";
  // Known counts only: from the cached scope summary, or the sum of loaded resource groups.
  const count = inScope
    ? scopeSummary.data?.data.bySubscription.find((b) => b.key.toLowerCase() === sub.subscriptionId.toLowerCase())
        ?.count
    : rgs.data?.data.reduce((n, g) => n + (g.resourceCount ?? 0), 0);

  const select = (e: MouseEvent) => {
    const additive = (e.metaKey || e.ctrlKey) && state.tenantId === sub.tenantId;
    if (additive) {
      const has = state.subscriptionIds.includes(sub.subscriptionId);
      const next = has
        ? state.subscriptionIds.filter((s) => s !== sub.subscriptionId)
        : [...state.subscriptionIds, sub.subscriptionId];
      if (next.length)
        update({ subscriptionIds: next, filters: { ...state.filters, resourceGroups: [] }, selectedId: undefined });
      return;
    }
    update({ tenantId: sub.tenantId, subscriptionIds: [sub.subscriptionId], filters: {}, selectedId: undefined });
  };

  const activeRgs = new Set((inScope ? (state.filters.resourceGroups ?? []) : []).map((r) => r.toLowerCase()));

  return (
    <div>
      <div className="relative">
        <Chevron open={open} onClick={() => toggle(sub.subscriptionId)} className="left-5" />
        <button
          type="button"
          onClick={select}
          aria-current={inScope ? "true" : undefined}
          title={`${sub.displayName}\n${sub.subscriptionId}${disabled ? `\n${sub.state}` : ""}`}
          className={clsx(
            rowBase,
            "h-auto min-h-7 py-1 pl-10 leading-[18px]",
            inScope ? "bg-raised font-medium text-ink shadow-[0_0_0_1px_var(--line)]" : "text-ink-2",
            disabled && "text-faint",
          )}
        >
          <span className="min-w-0 break-words">{sub.displayName}</span>
          {holdsSelection && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />}
          {disabled ? (
            <span className="ml-auto shrink-0 text-[11px] text-faint">{sub.state}</span>
          ) : (
            count !== undefined && (
              <span
                className={clsx("ml-auto shrink-0 text-[11px] font-normal", inScope ? "text-accent-ink" : "text-faint")}
              >
                {nf.format(count)}
              </span>
            )
          )}
        </button>
      </div>
      {open && (
        <div>
          {rgs.isPending && (
            <div className="space-y-2 py-1.5 pl-14">
              <Skeleton className="w-3/4" />
              <Skeleton className="w-1/2" />
            </div>
          )}
          {rgs.error && <TreeError error={rgs.error} />}
          {rgs.data?.data.length === 0 && <p className="py-1 pl-14 text-[12px] text-muted">No resource groups.</p>}
          {rgs.data?.data.map((rg) => {
            const active = activeRgs.has(rg.name.toLowerCase());
            const holds = holdsSelection && state.selectedId?.toLowerCase().split("/")[4] === rg.name.toLowerCase();
            return (
              <button
                key={rg.id}
                type="button"
                onClick={() =>
                  update({
                    tenantId: sub.tenantId,
                    subscriptionIds: inScope ? state.subscriptionIds : [sub.subscriptionId],
                    filters: { ...(inScope ? state.filters : {}), resourceGroups: active ? [] : [rg.name] },
                    selectedId: undefined,
                  })
                }
                title={`${rg.name} · ${rg.location}`}
                className={clsx(
                  rowBase,
                  "pl-14 text-[12px]",
                  active ? "bg-accent-soft font-medium text-accent-ink" : "text-muted",
                )}
              >
                <MiddleTruncate text={rg.name} tail={10} />
                {holds && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />}
                <span className={clsx("ml-auto shrink-0 text-[11px]", active ? "text-accent-ink" : "text-faint")}>
                  {nf.format(rg.resourceCount ?? 0)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
