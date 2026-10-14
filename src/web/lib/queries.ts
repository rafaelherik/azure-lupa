import { keepPreviousData, useInfiniteQuery, useQuery, type QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import type { CountBucket, ResourceFilters, ResourceRow, SortField, Summary } from "../../shared/types";
import { api } from "./api";
import {
  countSql,
  emptyResourceGroupsSql,
  groupCountSql,
  knownIdsSql,
  orphanCountsSql,
  orphanRulesForSql,
  relatedSql,
  rowsSql,
} from "./sql";

// DuckDB and Arrow load on first use, keeping them out of the initial bundle.
const duckdb = () => import("./duckdb").then((m) => m.duckdb());
const engine = () => import("./engine");

// The server caches on disk; the client keeps results in memory for the session.
const session = { staleTime: Infinity, gcTime: 30 * 60_000 };

/**
 * Refresh is a timestamp per tenant: it joins every query key for that tenant (so they refetch)
 * and is sent to the server (so its cache entries from before the click are ignored).
 */
const freshness = new Map<string, number>();
const freshnessListeners = new Set<() => void>();
let freshnessVersion = 0;

export function refreshTenant(tenantId: string) {
  freshness.set(tenantId, Date.now());
  freshnessVersion++;
  freshnessListeners.forEach((fn) => fn());
}

function useFreshAfter(tenantId: string | undefined): number | undefined {
  useSyncExternalStore(
    (fn) => {
      freshnessListeners.add(fn);
      return () => freshnessListeners.delete(fn);
    },
    () => freshnessVersion,
  );
  return tenantId ? freshness.get(tenantId) : undefined;
}

export function useTenants() {
  return useQuery({ queryKey: ["tenants"], queryFn: () => api.tenants(), ...session });
}

export function useSubscriptions(tenantId: string, enabled: boolean) {
  const freshAfter = useFreshAfter(tenantId);
  return useQuery({
    queryKey: ["subs", tenantId, freshAfter],
    queryFn: () => api.subscriptions(tenantId, freshAfter),
    enabled,
    retry: false,
    placeholderData: keepPreviousData,
    ...session,
  });
}

export function useResourceGroups(tenantId: string, subscriptionId: string, enabled: boolean) {
  const freshAfter = useFreshAfter(tenantId);
  return useQuery({
    queryKey: ["rgs", tenantId, subscriptionId, freshAfter],
    queryFn: () => api.resourceGroups(tenantId, subscriptionId, freshAfter),
    enabled,
    placeholderData: keepPreviousData,
    ...session,
  });
}

export interface Scope {
  tenantId?: string;
  subscriptionIds: string[];
}

export type Sort = { field: SortField; dir: "asc" | "desc" };

export interface LoadedSnapshot {
  /** DuckDB schema holding this scope's tables; part of every local query key. */
  schema: string;
  cachedAt: number;
  fromCache: boolean;
  total: number;
}

/** Latest schema per scope, so a reload can drop the one it replaces. */
const loadedSchemas = new Map<string, string>();

/**
 * The one Azure call per scope: fetch the inventory snapshot and load it into DuckDB. Everything
 * else in the resource views (rows, sorting, filters, summaries, orphans, relations) is local SQL.
 */
export function useSnapshot(scope: Scope) {
  const freshAfter = useFreshAfter(scope.tenantId);
  // Selection order is irrelevant to the data; sorting keeps A,B and B,A on one cached load.
  const subs = [...scope.subscriptionIds].sort();
  return useQuery({
    queryKey: ["snapshot", scope.tenantId, subs, freshAfter],
    enabled: Boolean(scope.tenantId && subs.length),
    queryFn: async (): Promise<LoadedSnapshot> => {
      const [res, conn, { loadSnapshot, dropSnapshot }] = await Promise.all([
        api.snapshot({ tenantId: scope.tenantId!, subscriptionIds: subs, freshAfter }),
        duckdb(),
        engine(),
      ]);
      const schema = await loadSnapshot(conn, res.data);
      const key = JSON.stringify([scope.tenantId, subs]);
      const previous = loadedSchemas.get(key);
      loadedSchemas.set(key, schema);
      // Give queries still reading the old schema time to finish before dropping it.
      if (previous) setTimeout(() => void dropSnapshot(conn, previous), 60_000);
      return { schema, cachedAt: res.cachedAt, fromCache: res.fromCache, total: res.data.resources.length };
    },
    placeholderData: keepPreviousData,
    ...session,
  });
}

/**
 * Drop a snapshot's DuckDB schema when React Query garbage-collects its query (gcTime after the
 * last observer leaves), so scopes visited earlier in the session do not pile up in wasm memory.
 */
export function installSnapshotGc(client: QueryClient) {
  return client.getQueryCache().subscribe((event) => {
    if (event.type !== "removed" || event.query.queryKey[0] !== "snapshot") return;
    const schema = (event.query.state.data as LoadedSnapshot | undefined)?.schema;
    if (!schema) return;
    for (const [key, s] of loadedSchemas) if (s === schema) loadedSchemas.delete(key);
    void Promise.all([duckdb(), engine()]).then(([conn, { dropSnapshot }]) => dropSnapshot(conn, schema));
  });
}

/** A table row: a resource plus the ids of orphan rules that flag it. */
export interface TableRow extends ResourceRow {
  orphanRules?: string[];
}

interface SqlRow {
  id: string;
  name: string;
  type: string;
  kind: string | null;
  location: string | null;
  resourceGroup: string;
  subscriptionId: string;
  tenantId: string;
  sku: string | null;
  provisioningState: string | null;
  tagsJson: string | null;
  orphanRules: string | null;
}

const toRow = (r: SqlRow): TableRow => ({
  id: r.id,
  name: r.name,
  type: r.type,
  kind: r.kind ?? undefined,
  location: r.location ?? "",
  resourceGroup: r.resourceGroup,
  subscriptionId: r.subscriptionId,
  tenantId: r.tenantId,
  sku: r.sku ?? undefined,
  provisioningState: r.provisioningState ?? undefined,
  tags: r.tagsJson ? (JSON.parse(r.tagsJson) as Record<string, string>) : undefined,
  orphanRules: r.orphanRules ? r.orphanRules.split(",") : undefined,
});

const PAGE_SIZE = 500;

export function useResources(scope: Scope, filters: ResourceFilters, sort: Sort) {
  const schema = useSnapshot(scope).data?.schema;
  return useInfiniteQuery({
    queryKey: ["resources", schema, filters, sort],
    enabled: Boolean(schema),
    initialPageParam: { offset: 0, total: undefined as number | undefined },
    queryFn: async ({ pageParam: { offset, total: known } }) => {
      const conn = await duckdb();
      // The filtered count only changes with the key, so only the first page computes it.
      const [rows, total] = await Promise.all([
        conn.query<SqlRow>(rowsSql(schema!, filters, sort, { offset, limit: PAGE_SIZE })),
        known ?? conn.query<{ n: number }>(countSql(schema!, filters)).then((c) => c[0]?.n ?? 0),
      ]);
      const next = offset + rows.length;
      return { rows: rows.map(toRow), total, nextOffset: next < total ? next : undefined };
    },
    getNextPageParam: (last) =>
      last.nextOffset === undefined ? undefined : { offset: last.nextOffset, total: last.total },
    placeholderData: keepPreviousData,
    ...session,
  });
}

/** Every row matching the filters, for export. */
export async function queryAllRows(schema: string, filters: ResourceFilters, sort: Sort): Promise<TableRow[]> {
  const conn = await duckdb();
  return (await conn.query<SqlRow>(rowsSql(schema, filters, sort))).map(toRow);
}

export interface LocalSummary extends Summary {
  /** Potential orphans by rule id. */
  orphans: CountBucket[];
}

export function useSummary(scope: Scope, filters: ResourceFilters = {}) {
  const schema = useSnapshot(scope).data?.schema;
  return useQuery({
    queryKey: ["summary", schema, filters],
    enabled: Boolean(schema),
    queryFn: async (): Promise<LocalSummary> => {
      const conn = await duckdb();
      const group = (col: Parameters<typeof groupCountSql>[1]) =>
        conn.query<CountBucket>(groupCountSql(schema!, col, filters));
      const [byType, byLocation, bySubscription, byResourceGroup, orphans] = await Promise.all([
        group("type"),
        group("location"),
        group("subscriptionId"),
        group("resourceGroup"),
        conn.query<CountBucket>(orphanCountsSql(schema!, filters)),
      ]);
      const total = byType.reduce((n, b) => n + b.count, 0);
      return { total, byType, byLocation, bySubscription, byResourceGroup, orphans };
    },
    placeholderData: keepPreviousData,
    ...session,
  });
}

export interface EmptyResourceGroup {
  id: string;
  name: string;
  subscriptionId: string;
  location: string;
}

export function useEmptyResourceGroups(schema: string | undefined) {
  return useQuery({
    queryKey: ["emptyRgs", schema],
    enabled: Boolean(schema),
    queryFn: async () => (await duckdb()).query<EmptyResourceGroup>(emptyResourceGroupsSql(schema!)),
    ...session,
  });
}

export type Relation = "parent" | "child" | "uses" | "usedBy" | "linked" | "external";

export interface RelatedResource {
  relation: Relation;
  id: string;
  name: string | null;
  type: string | null;
}

export function useRelated(schema: string | undefined, id: string) {
  return useQuery({
    queryKey: ["related", schema, id.toLowerCase()],
    enabled: Boolean(schema),
    queryFn: async () => (await duckdb()).query<RelatedResource>(relatedSql(schema!, id)),
    ...session,
  });
}

export function useOrphanRules(schema: string | undefined, id: string) {
  return useQuery({
    queryKey: ["orphanRules", schema, id.toLowerCase()],
    enabled: Boolean(schema),
    queryFn: async () =>
      (await (await duckdb()).query<{ ruleId: string }>(orphanRulesForSql(schema!, id))).map((r) => r.ruleId),
    ...session,
  });
}

/** The subset of `ids` that are resources in the snapshot, lowercased. */
export function useKnownIds(schema: string | undefined, ids: string[]) {
  return useQuery({
    queryKey: ["knownIds", schema, ids],
    enabled: Boolean(schema && ids.length),
    queryFn: async () => {
      const sql = knownIdsSql(schema!, ids);
      const rows = sql ? await (await duckdb()).query<{ id: string }>(sql) : [];
      return new Set(rows.map((r) => r.id.toLowerCase()));
    },
    ...session,
  });
}

export function useDetails(tenantId: string | undefined, id: string | undefined) {
  const freshAfter = useFreshAfter(tenantId);
  return useQuery({
    queryKey: ["details", tenantId, id, freshAfter],
    enabled: Boolean(tenantId && id),
    queryFn: () => api.details(tenantId!, id!, freshAfter),
    ...session,
  });
}
