import { useCallback, useSyncExternalStore } from "react";
import {
  vaultRanges,
  validAuditDates,
  type AuditFilters,
  type ResourceFilters,
  type SortField,
} from "../../shared/types";

/** Everything that defines the current view lives in the URL, so views are linkable and Back works. */
export interface ViewState {
  tenantId?: string;
  subscriptionIds: string[];
  view: "resources" | "dashboard";
  filters: ResourceFilters;
  sort: { field: SortField; dir: "asc" | "desc" };
  selectedId?: string;
  vaultAudit?: boolean;
  auditFilters?: AuditFilters;
}

const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

export function parse(search: string): ViewState {
  const p = new URLSearchParams(search);
  const [field, dir] = (p.get("sort") ?? "name:asc").split(":");
  const range = vaultRanges.find((r) => r === p.get("range")) ?? "24h";
  const from = p.get("from") ?? undefined;
  const to = p.get("to") ?? undefined;
  const period =
    range === "custom" ? (validAuditDates(from, to) ? { range, from, to } : { range: "24h" as const }) : { range };
  return {
    ...(p.get("audit") === "1" ? { auditFilters: { ...period, actions: p.getAll("action") } } : {}),
    tenantId: p.get("tenant") ?? undefined,
    subscriptionIds: list(p.get("subs")),
    view: p.get("view") === "dashboard" ? "dashboard" : "resources",
    filters: {
      search: p.get("q") ?? undefined,
      types: list(p.get("types")),
      locations: list(p.get("locations")),
      resourceGroups: list(p.get("rgs")),
      tags: list(p.get("tags")),
      orphansOnly: p.get("orphans") === "1" || undefined,
    },
    sort: { field: (field as SortField) || "name", dir: dir === "desc" ? "desc" : "asc" },
    selectedId: p.get("id") ?? undefined,
    vaultAudit: p.get("audit") === "1" || undefined,
  };
}

export function serialize(s: ViewState): string {
  const p = new URLSearchParams();
  const set = (k: string, v?: string | string[]) => {
    const value = Array.isArray(v) ? v.join(",") : v;
    if (value) p.set(k, value);
  };
  set("tenant", s.tenantId);
  set("subs", s.subscriptionIds);
  if (s.view !== "resources") set("view", s.view);
  set("q", s.filters.search);
  set("types", s.filters.types);
  set("locations", s.filters.locations);
  set("rgs", s.filters.resourceGroups);
  set("tags", s.filters.tags);
  if (s.filters.orphansOnly) set("orphans", "1");
  if (s.sort.field !== "name" || s.sort.dir !== "asc") set("sort", `${s.sort.field}:${s.sort.dir}`);
  set("id", s.selectedId);
  if (s.selectedId && s.vaultAudit) {
    set("audit", "1");
    const f = s.auditFilters;
    if (f && f.range !== "24h") set("range", f.range);
    if (f?.range === "custom") {
      set("from", f.from);
      set("to", f.to);
    }
    for (const action of f?.actions ?? []) p.append("action", action);
  }
  const str = p.toString().replace(/%2C/g, ",");
  return str ? `?${str}` : "";
}

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  window.addEventListener("popstate", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("popstate", fn);
  };
};

let cachedSearch = "";
let cachedState = parse("");
const snapshot = () => {
  if (location.search !== cachedSearch) {
    cachedSearch = location.search;
    cachedState = parse(cachedSearch);
  }
  return cachedState;
};

export function useViewState() {
  const state = useSyncExternalStore(subscribe, snapshot);
  const update = useCallback(
    (patch: Partial<ViewState> | ((s: ViewState) => Partial<ViewState>), opts: { replace?: boolean } = {}) => {
      const current = snapshot();
      const next = { ...current, ...(typeof patch === "function" ? patch(current) : patch) };
      const url = location.pathname + serialize(next);
      if (opts.replace) history.replaceState(null, "", url);
      else history.pushState(null, "", url);
      listeners.forEach((fn) => fn());
    },
    [],
  );
  return [state, update] as const;
}

export const hasFilters = (f: ResourceFilters) =>
  Boolean(
    f.search || f.types?.length || f.locations?.length || f.resourceGroups?.length || f.tags?.length || f.orphansOnly,
  );
