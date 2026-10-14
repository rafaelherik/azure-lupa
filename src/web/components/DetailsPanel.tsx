import clsx from "clsx";
import { ChevronRight, Copy, ExternalLink, RefreshCw, TriangleAlert, X } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { RULES_BY_ID } from "../../shared/orphans";
import { RequestError } from "../lib/api";
import { portalUrl, timeAgo, typeWithinProvider } from "../lib/format";
import { ResourceIcon } from "../lib/icons";
import {
  refreshTenant,
  useDetails,
  useKnownIds,
  useOrphanRules,
  useRelated,
  useSnapshot,
  type Relation,
  type RelatedResource,
} from "../lib/queries";
import { useViewState } from "../lib/state";
import { copy } from "../lib/toast";
import { Button, IconButton, Skeleton } from "./ui";

type Tab = "overview" | "properties" | "json";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const obj = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

/** Lets values deep in the property tree link to resources loaded in the current snapshot. */
const ResourceLinks = createContext<{ known?: Set<string>; open: (id: string) => void }>({ open: () => {} });

/** Every ARM id string inside a value (capped, to keep the lookup query small). */
function armIdsIn(value: unknown, out = new Set<string>()): string[] {
  if (out.size >= 200) return [...out];
  if (typeof value === "string") {
    if (value.startsWith("/subscriptions/")) out.add(value);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) armIdsIn(v, out);
  }
  return [...out];
}

export function DetailsPanel({
  tenantId,
  id,
  subscriptionNames,
}: {
  tenantId: string;
  id: string;
  subscriptionNames: Map<string, string>;
}) {
  const [state, update] = useViewState();
  const [tab, setTab] = useState<Tab>("overview");
  const details = useDetails(tenantId, id);
  const scope = useMemo(
    () => ({ tenantId: state.tenantId, subscriptionIds: state.subscriptionIds }),
    [state.tenantId, state.subscriptionIds],
  );
  const schema = useSnapshot(scope).data?.schema;
  const r = details.data?.data.resource;
  const parts = id.split("/");
  const name = str(r?.name) ?? parts.at(-1) ?? id;
  const type = str(r?.type) ?? typeFromId(id);
  const close = () => update({ selectedId: undefined }, { replace: true });
  const open = (target: string) => update({ selectedId: target });
  const propertyIds = useMemo(() => armIdsIn(r?.properties), [r]);
  const known = useKnownIds(schema, propertyIds).data;
  const links = useMemo(() => ({ known, open }), [known]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as HTMLElement).closest("input,[role=dialog]")) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFilter = (patch: { resourceGroups?: string[]; tags?: string[]; locations?: string[] }) =>
    update((s) => ({ view: "resources", filters: { ...s.filters, ...patch } }), { replace: true });

  return (
    <section
      aria-label="Resource details"
      className="drawer-in flex h-full w-full min-w-0 flex-col border-l border-line bg-bg lg:w-[460px] lg:shrink-0"
    >
      <header className="shrink-0 border-b border-line px-5 pt-4">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-line bg-panel">
            <ResourceIcon type={type} className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] leading-6 font-semibold" title={name}>
              {name}
            </h2>
            <p className="truncate font-mono text-[12px] text-muted" title={type}>
              {type || " "}
            </p>
          </div>
          <IconButton label="Close details (Esc)" onClick={close}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => copy(id, "Resource ID copied")}>
            <Copy className="size-3.5" />
            Copy ID
          </Button>
          <a
            href={portalUrl(id, tenantId)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-raised px-2 text-[12px] font-medium hover:bg-hover"
          >
            <ExternalLink className="size-3.5" />
            Open in Azure Portal
          </a>
        </div>
        <div role="tablist" className="mt-3 flex gap-4">
          {(["overview", "properties", "json"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={clsx(
                "-mb-px h-9 border-b-2 text-[13px] font-medium capitalize transition-colors duration-150",
                tab === t ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t === "json" ? "JSON" : t}
            </button>
          ))}
        </div>
      </header>

      <ResourceLinks.Provider value={links}>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {details.isPending && (
            <div className="space-y-4 p-5">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="grid grid-cols-[120px_1fr] gap-3">
                  <Skeleton className="w-20" />
                  <Skeleton className={i % 2 ? "w-1/2" : "w-3/4"} />
                </div>
              ))}
            </div>
          )}
          {details.error && <DetailsError error={details.error} onRetry={() => void details.refetch()} />}
          {tab === "overview" && <OrphanCallout schema={schema} id={id} />}
          {r && tab === "overview" && (
            <Overview
              r={r}
              id={id}
              schema={schema}
              tenantId={tenantId}
              apiVersion={details.data!.data.apiVersion}
              subscriptionNames={subscriptionNames}
              onFilterRg={(rg) => addFilter({ resourceGroups: [rg] })}
              onFilterTag={(t) => addFilter({ tags: [...new Set([...(state.filters.tags ?? []), t])] })}
            />
          )}
          {r && tab === "properties" && (
            <div className="p-3">
              {obj(r.properties) ? (
                <PropertyTree value={r.properties} depth={0} />
              ) : (
                <p className="p-2 text-[13px] text-muted">This resource has no properties.</p>
              )}
            </div>
          )}
          {r && tab === "json" && <JsonView value={r} />}
        </div>
      </ResourceLinks.Provider>

      {details.data && (
        <footer className="flex h-10 shrink-0 items-center gap-2 border-t border-line bg-panel px-5 text-[12px] text-muted">
          <span>
            {details.data.fromCache ? "Cached" : "Fetched"} {timeAgo(details.data.cachedAt)} · API{" "}
            {details.data.data.apiVersion}
          </span>
          <button
            type="button"
            onClick={() => refreshTenant(tenantId)}
            className="ml-auto inline-flex items-center gap-1 font-medium text-accent hover:underline"
          >
            <RefreshCw className={clsx("size-3", details.isFetching && "animate-spin")} />
            Refresh
          </button>
        </footer>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_1fr] gap-3 py-1.5">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="min-w-0 text-[13px] break-words text-ink">{children}</dd>
    </div>
  );
}

const Dash = () => <span className="text-faint">—</span>;

/** "…/providers/Microsoft.Sql/servers/s/databases/d" → "Microsoft.Sql/servers/databases". */
function typeFromId(id: string): string {
  const parts = id.split("/");
  const p = parts.map((x) => x.toLowerCase()).lastIndexOf("providers");
  if (p === -1 || !parts[p + 1]) return "";
  return [parts[p + 1], ...parts.slice(p + 2).filter((_, i) => i % 2 === 0)].join("/");
}

function OrphanCallout({ schema, id }: { schema?: string; id: string }) {
  const rules = useOrphanRules(schema, id).data ?? [];
  if (!rules.length) return null;
  return (
    <div className="mx-5 mt-4 rounded-md border border-warn/40 bg-warn-soft px-3 py-2.5">
      {rules.map((ruleId) => {
        const rule = RULES_BY_ID.get(ruleId);
        return (
          <div key={ruleId} className="flex gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
            <div className="min-w-0 text-[13px]">
              <p className="font-medium text-warn">Potential orphan: {rule?.title ?? ruleId}</p>
              {rule && (
                <p className="mt-0.5 text-ink-2">
                  {rule.reason}{" "}
                  <a href={rule.learnUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    Microsoft Learn
                  </a>
                </p>
              )}
              <p className="mt-1 text-[12px] text-muted">
                A heuristic. Confirm in the portal before deleting anything.
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const RELATIONS: Array<{ key: Relation; label: string }> = [
  { key: "parent", label: "Parent" },
  { key: "child", label: "Contains" },
  { key: "linked", label: "Linked both ways" },
  { key: "uses", label: "Uses" },
  { key: "usedBy", label: "Used by" },
  { key: "external", label: "Outside the loaded scope" },
];

function Related({ schema, id, tenantId }: { schema?: string; id: string; tenantId: string }) {
  const related = useRelated(schema, id);
  const { open } = useContext(ResourceLinks);
  const groups = useMemo(() => {
    const rows = related.data ?? [];
    // References in both directions (a NIC and its VM name each other) are listed once.
    const uses = new Set(rows.filter((r) => r.relation === "uses").map((r) => r.id));
    const both = new Set(rows.filter((r) => r.relation === "usedBy" && uses.has(r.id)).map((r) => r.id));
    const by = new Map<Relation, RelatedResource[]>();
    for (const r of rows) {
      const relation = both.has(r.id) && (r.relation === "uses" || r.relation === "usedBy") ? "linked" : r.relation;
      if (relation === "linked" && r.relation === "usedBy") continue;
      by.set(relation, [...(by.get(relation) ?? []), { ...r, relation }]);
    }
    return RELATIONS.filter((g) => by.has(g.key)).map((g) => ({ ...g, items: by.get(g.key)! }));
  }, [related.data]);
  const count = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <>
      <h3 className="pt-4 pb-2 text-[12px] font-semibold text-ink">
        Related <span className="font-normal text-muted">{related.data ? count : ""}</span>
      </h3>
      {!schema || related.isPending ? (
        <div className="space-y-2">
          <Skeleton className="w-2/3" />
          <Skeleton className="w-1/2" />
        </div>
      ) : count === 0 ? (
        <p className="text-[13px] text-muted">No references to or from other resources in this scope.</p>
      ) : (
        <div className="space-y-3 border-b border-line pb-3">
          {groups.map((g) => (
            <div key={g.key}>
              <p className="pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">{g.label}</p>
              <ul>
                {g.items.map((item) =>
                  item.relation === "external" ? (
                    <li key={item.id} className="flex items-center gap-2 py-1">
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-2" title={item.id}>
                        {item.id}
                      </span>
                      <a
                        href={portalUrl(item.id, tenantId)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open in Azure Portal"
                        title="Open in Azure Portal"
                        className="shrink-0 text-faint hover:text-accent"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    </li>
                  ) : (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => open(item.id)}
                        title={item.id}
                        className="-mx-2 flex w-[calc(100%+16px)] items-center gap-2 rounded px-2 py-1 text-left hover:bg-hover"
                      >
                        <ResourceIcon type={item.type ?? ""} className="size-4" />
                        <span className="min-w-0 truncate text-[13px] text-accent">{item.name}</span>
                        <span className="ml-auto shrink-0 truncate font-mono text-[11px] text-faint">
                          {typeWithinProvider(item.type ?? "")}
                        </span>
                      </button>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Overview({
  r,
  id,
  schema,
  tenantId,
  apiVersion,
  subscriptionNames,
  onFilterRg,
  onFilterTag,
}: {
  r: Record<string, unknown>;
  id: string;
  schema?: string;
  tenantId: string;
  apiVersion: string;
  subscriptionNames: Map<string, string>;
  onFilterRg: (rg: string) => void;
  onFilterTag: (tag: string) => void;
}) {
  const parts = id.split("/");
  const subId = parts[2] ?? "";
  const rg = parts[4] ?? "";
  const props = obj(r.properties) ?? {};
  const sku = obj(r.sku);
  const identity = obj(r.identity);
  const system = obj(r.systemData);
  const tags = Object.entries(obj(r.tags) ?? {}) as Array<[string, string]>;
  const state = str(props.provisioningState);

  return (
    <div className="px-5 py-3">
      <h3 className="pt-1 pb-1 text-[12px] font-semibold text-ink">Essentials</h3>
      <dl className="border-b border-line pb-3">
        <Row label="Resource group">
          <button
            type="button"
            className="text-accent hover:underline"
            onClick={() => onFilterRg(rg)}
            title="Filter by this resource group"
          >
            {rg}
          </button>
        </Row>
        <Row label="Subscription">
          <span>{subscriptionNames.get(subId) ?? subId}</span>
          {subscriptionNames.has(subId) && <span className="block font-mono text-[11px] text-muted">{subId}</span>}
        </Row>
        <Row label="Location">{str(r.location) ?? <Dash />}</Row>
        <Row label="Kind">{str(r.kind) ?? <Dash />}</Row>
        <Row label="SKU">{sku ? [str(sku.name), str(sku.tier)].filter(Boolean).join(" · ") || <Dash /> : <Dash />}</Row>
        <Row label="Provisioning">
          {state ? (
            <span
              className={clsx(
                "inline-flex items-center gap-1.5",
                state === "Succeeded" ? "text-ink" : state === "Failed" ? "text-danger" : "text-warn",
              )}
            >
              <span
                aria-hidden
                className={clsx(
                  "size-1.5 rounded-full",
                  state === "Succeeded" ? "bg-ok" : state === "Failed" ? "bg-danger" : "bg-warn",
                )}
              />
              {state}
            </span>
          ) : (
            <Dash />
          )}
        </Row>
        <Row label="Identity">{identity ? (str(identity.type) ?? <Dash />) : <Dash />}</Row>
        {system?.createdAt !== undefined && (
          <Row label="Created">
            {new Date(String(system.createdAt)).toLocaleString()}
            {str(system.createdBy) && <span className="block text-[12px] text-muted">by {str(system.createdBy)}</span>}
          </Row>
        )}
        {system?.lastModifiedAt !== undefined && (
          <Row label="Last modified">{new Date(String(system.lastModifiedAt)).toLocaleString()}</Row>
        )}
        <Row label="API version">
          <span className="font-mono text-[12px]">{apiVersion}</span>
        </Row>
        <Row label="Resource ID">
          <button
            type="button"
            onClick={() => copy(id, "Resource ID copied")}
            className="text-left font-mono text-[11px] break-all text-ink-2 hover:text-ink"
            title="Copy"
          >
            {id}
          </button>
        </Row>
      </dl>

      <Related schema={schema} id={id} tenantId={tenantId} />

      <h3 className="pt-4 pb-2 text-[12px] font-semibold text-ink">
        Tags <span className="font-normal text-muted">{tags.length}</span>
      </h3>
      {tags.length === 0 && <p className="text-[13px] text-muted">No tags.</p>}
      <ul className="flex flex-wrap gap-1.5">
        {tags.map(([k, v]) => (
          <li key={k}>
            <button
              type="button"
              onClick={() => onFilterTag(`${k}=${v}`)}
              title="Filter by this tag"
              className="inline-flex max-w-full items-center rounded bg-hover px-1.5 text-left text-[12px] leading-[22px] hover:bg-line"
            >
              <span className="text-muted">{k}</span>
              <span className="px-0.5 text-faint">=</span>
              <span className="truncate text-ink">{v}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function isScalar(v: unknown) {
  return v === null || typeof v !== "object";
}

function Scalar({ v }: { v: unknown }) {
  const { known, open } = useContext(ResourceLinks);
  if (v === null) return <span className="text-faint">null</span>;
  if (typeof v === "boolean") return <span className="font-mono text-[12px] text-accent-ink">{String(v)}</span>;
  if (typeof v === "number") return <span className="font-mono text-[12px] text-accent-ink">{v}</span>;
  const s = String(v);
  if (known?.has(s.toLowerCase())) {
    return (
      <button
        type="button"
        onClick={() => open(s)}
        title="Open this resource"
        className="text-left font-mono text-[11px] break-all text-accent hover:underline"
      >
        {s}
      </button>
    );
  }
  return (
    <span className={clsx("break-all", s.startsWith("/subscriptions/") && "font-mono text-[11px]")}>
      {s || <span className="text-faint">""</span>}
    </span>
  );
}

function PropertyTree({ value, depth }: { value: unknown; depth: number }) {
  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);
  if (!entries.length)
    return <span className="px-2 text-[12px] text-faint">{Array.isArray(value) ? "[ ]" : "{ }"}</span>;
  return (
    <ul className={clsx(depth > 0 && "ml-3 border-l border-line pl-2")}>
      {entries.map(([k, v]) => (
        <PropertyNode key={k} k={k} v={v} depth={depth} />
      ))}
    </ul>
  );
}

function PropertyNode({ k, v, depth }: { k: string; v: unknown; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  if (isScalar(v)) {
    return (
      <li className="grid grid-cols-[minmax(110px,40%)_1fr] gap-3 rounded px-2 py-1 text-[13px] hover:bg-hover">
        <span className="truncate text-muted" title={k}>
          {k}
        </span>
        <Scalar v={v} />
      </li>
    );
  }
  const size = Array.isArray(v) ? v.length : Object.keys(v as object).length;
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1 rounded px-1 py-1 text-left text-[13px] hover:bg-hover"
      >
        <ChevronRight
          className={clsx("size-3.5 shrink-0 text-faint transition-transform duration-150", open && "rotate-90")}
        />
        <span className="text-ink">{k}</span>
        <span className="text-[11px] text-faint">{Array.isArray(v) ? `[${size}]` : `{${size}}`}</span>
      </button>
      {open && <PropertyTree value={v} depth={depth + 1} />}
    </li>
  );
}

function JsonView({ value }: { value: unknown }) {
  const text = useMemo(() => JSON.stringify(value, null, 2), [value]);
  // Light-touch highlighting: keys, strings, numbers/booleans.
  const html = useMemo(
    () =>
      text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(
          /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
          (m, str, colon, lit, num) => {
            if (str)
              return colon ? `<span class="text-ink">${str}</span>${colon}` : `<span class="text-ok">${str}</span>`;
            if (lit) return `<span class="text-accent-ink">${lit}</span>`;
            if (num) return `<span class="text-accent-ink">${num}</span>`;
            return m;
          },
        ),
    [text],
  );
  return (
    <div className="relative">
      <Button size="sm" className="absolute top-3 right-4" onClick={() => copy(text, "JSON copied")}>
        <Copy className="size-3.5" />
        Copy
      </Button>
      <pre
        className="overflow-x-auto p-5 font-mono text-[12px] leading-[18px] text-muted"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function DetailsError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const e = error instanceof RequestError ? error : undefined;
  return (
    <div className="p-5">
      <p className="text-[13px] font-medium text-danger">
        {e?.status === 403 ? "You do not have read access to this resource" : "Could not load details"}
      </p>
      <p className="mt-1 text-[13px] text-muted">{error.message}</p>
      {e?.hint && <code className="mt-2 block rounded bg-hover px-2 py-1 font-mono text-[12px]">{e.hint}</code>}
      <Button className="mt-3" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
