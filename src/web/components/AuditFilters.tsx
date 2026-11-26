import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { validAuditDates, vaultRanges, type AuditFilters, type VaultLogRange } from "../../shared/types";
import { vaultApi } from "../lib/api";
import { useViewState } from "../lib/state";
import { useVaultChoices } from "../lib/queries";
import { Button } from "./ui";

const labels: Record<VaultLogRange, string> = {
  "1h": "Last hour",
  "6h": "Last 6 hours",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  custom: "Custom dates",
};
const control = "rounded-md border border-line bg-raised px-2 py-1 text-ink";
const label = "flex flex-col gap-1 text-xs font-medium text-muted";

export function AuditControls({
  tenantId,
  id,
  schema,
  subscriptions,
}: {
  tenantId: string;
  id: string;
  schema?: string;
  subscriptions: Map<string, string>;
}) {
  const [state, update] = useViewState();
  const filters = state.auditFilters ?? { range: "24h" };
  const { range, from, to, actions = [] } = filters;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const vaults = useVaultChoices(schema);
  const choices = useQuery({
    queryKey: ["auditActions", tenantId, id, range, from, to],
    enabled: open,
    retry: false,
    staleTime: 60_000,
    queryFn: ({ signal }) => vaultApi.actions(tenantId, id, { range, from, to }, signal),
  });
  const available = [...new Set([...actions, ...(choices.data?.actions ?? [])])].filter((a) =>
    a.toLowerCase().includes(search.toLowerCase()),
  );
  const change = (filters: AuditFilters) => update({ auditFilters: filters });
  return (
    <div className="mt-4 flex flex-wrap items-start gap-3 text-[13px]">
      <label className={label}>
        Key Vault
        <select
          className={control}
          value={id.toLowerCase()}
          onChange={(e) => {
            const vault = vaults.data?.find((v) => v.id.toLowerCase() === e.target.value);
            if (vault) update({ selectedId: vault.id });
          }}
        >
          {!vaults.data?.some((v) => v.id.toLowerCase() === id.toLowerCase()) && (
            <option value={id.toLowerCase()}>{id.split("/").at(-1)}</option>
          )}
          {vaults.data?.map((v) => (
            <option key={v.id} value={v.id.toLowerCase()}>
              {v.name} · {subscriptions.get(v.subscriptionId) ?? v.subscriptionId}
            </option>
          ))}
        </select>
      </label>
      {vaults.isError && (
        <Button size="sm" onClick={() => void vaults.refetch()}>
          Retry vault list
        </Button>
      )}
      <TimeFilter key={[range, from, to].join("/")} filters={filters} change={change} />
      <div className="relative">
        <span className={label}>Actions</span>
        <button
          type="button"
          aria-label="Filter actions"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            setSearch("");
          }}
          className={control + " mt-1"}
        >
          {actions.length ? `${actions.length} selected` : "All actions"} ▾
        </button>
        {open && (
          <div
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                e.currentTarget.parentElement?.querySelector("button")?.focus();
              }
            }}
            className="absolute z-20 mt-1 w-60 max-w-[85vw] rounded-md border border-line bg-panel p-3 shadow-overlay"
          >
            <input
              autoFocus
              aria-label="Search actions"
              placeholder="Search actions"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={control + " w-full"}
            />
            {choices.isLoading && <p role="status">Loading actions…</p>}
            {choices.isError && (
              <Button size="sm" onClick={() => void choices.refetch()}>
                Retry loading actions
              </Button>
            )}
            {choices.data?.partial && <p>Azure Monitor returned partial results.</p>}
            <div className="my-2 max-h-56 overflow-auto">
              {available.map((a) => (
                <label key={a} className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    checked={actions.includes(a)}
                    onChange={() =>
                      change({
                        ...filters,
                        actions: actions.includes(a) ? actions.filter((item) => item !== a) : [...actions, a].sort(),
                      })
                    }
                  />
                  {a}
                </label>
              ))}
            </div>
            {choices.data && !available.length && <p>No matching actions.</p>}
            <Button size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        )}
      </div>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-1 self-end">
          {actions.map((a) => (
            <button
              key={a}
              aria-label={`Remove ${a}`}
              className={control}
              onClick={() => change({ ...filters, actions: actions.filter((item) => item !== a) })}
            >
              {a} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TimeFilter({ filters, change }: { filters: AuditFilters; change: (f: AuditFilters) => void }) {
  const [custom, setCustom] = useState(filters.range === "custom");
  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");
  return (
    <>
      <label className={label}>
        Time range
        <select
          className={control}
          value={custom ? "custom" : filters.range}
          onChange={(e) => {
            const range = e.target.value as VaultLogRange;
            setCustom(range === "custom");
            if (range !== "custom") change({ range, actions: filters.actions });
          }}
        >
          {vaultRanges.map((r) => (
            <option key={r} value={r}>
              {labels[r]}
            </option>
          ))}
        </select>
      </label>
      {custom && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (validAuditDates(from, to)) change({ ...filters, range: "custom", from, to });
          }}
        >
          <label className={label}>
            From (UTC)
            <input
              className={control}
              type="date"
              required
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className={label}>
            Through (UTC)
            <input
              className={control}
              type="date"
              required
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <Button size="sm" type="submit" disabled={!validAuditDates(from, to)}>
            Apply dates
          </Button>
        </form>
      )}
    </>
  );
}
