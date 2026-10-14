import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import type { ResourceFilters, SortField } from "../../shared/types";
import { api } from "./api";

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

export function useResources(scope: Scope, filters: ResourceFilters, sort: Sort) {
  const freshAfter = useFreshAfter(scope.tenantId);
  return useInfiniteQuery({
    queryKey: ["resources", scope.tenantId, scope.subscriptionIds, filters, sort, freshAfter],
    enabled: Boolean(scope.tenantId && scope.subscriptionIds.length),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.resources({
        tenantId: scope.tenantId!,
        subscriptionIds: scope.subscriptionIds,
        filters,
        sort,
        skipToken: pageParam,
        freshAfter,
      }),
    getNextPageParam: (last) => last.data.skipToken,
    placeholderData: keepPreviousData,
    ...session,
  });
}

export function useSummary(scope: Scope, filters: ResourceFilters = {}) {
  const freshAfter = useFreshAfter(scope.tenantId);
  return useQuery({
    queryKey: ["summary", scope.tenantId, scope.subscriptionIds, filters, freshAfter],
    enabled: Boolean(scope.tenantId && scope.subscriptionIds.length),
    queryFn: () =>
      api.summary({ tenantId: scope.tenantId!, subscriptionIds: scope.subscriptionIds, filters, freshAfter }),
    placeholderData: keepPreviousData,
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
