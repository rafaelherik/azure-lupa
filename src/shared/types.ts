// DTOs shared by the local API server and the web UI.

import type { Facts } from "./orphans.js";

export interface Cached<T> {
  data: T;
  /** Epoch ms when the data was fetched from Azure. */
  cachedAt: number;
  fromCache: boolean;
}

export interface Tenant {
  tenantId: string;
  displayName: string;
  defaultDomain?: string;
  /** "ok" when a token could be acquired for this tenant. */
  status: "ok" | "needs-login";
  error?: string;
}

export interface Subscription {
  subscriptionId: string;
  tenantId: string;
  displayName: string;
  state: string;
}

export interface ResourceGroup {
  id: string;
  name: string;
  location: string;
  subscriptionId: string;
  resourceCount?: number;
}

export interface ResourceRow {
  id: string;
  name: string;
  type: string;
  kind?: string;
  location: string;
  resourceGroup: string;
  subscriptionId: string;
  tenantId: string;
  sku?: string;
  tags?: Record<string, string>;
  provisioningState?: string;
}

export interface ResourceFilters {
  search?: string;
  types?: string[];
  locations?: string[];
  resourceGroups?: string[];
  /** Tag filters as key or key=value. */
  tags?: string[];
  /** Only resources flagged by an orphan rule. */
  orphansOnly?: boolean;
}

export type SortField = "name" | "type" | "location" | "resourceGroup" | "subscriptionId";

export interface CountBucket {
  key: string;
  count: number;
}

export interface Summary {
  total: number;
  byType: CountBucket[];
  byLocation: CountBucket[];
  bySubscription: CountBucket[];
  byResourceGroup: CountBucket[];
}

/** A resource as shipped to the browser engine: list fields plus what orphan rules and relations need. */
export interface SnapshotRow extends ResourceRow {
  managedBy?: string;
  facts?: Facts;
  /** Lowercased ARM ids referenced from the resource's properties. */
  refs?: string[];
}

export interface Snapshot {
  resources: SnapshotRow[];
  resourceGroups: ResourceGroup[];
}

export interface SnapshotQuery {
  tenantId: string;
  subscriptionIds: string[];
  /** Epoch ms; cached data older than this is refetched from Azure. */
  freshAfter?: number;
}

export interface ResourceDetails {
  resource: Record<string, unknown>;
  apiVersion: string;
}

export interface ApiError {
  error: string;
  code?: string;
  hint?: string;
}
