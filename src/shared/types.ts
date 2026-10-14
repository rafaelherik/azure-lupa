// DTOs shared by the local API server and the web UI.

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
}

export type SortField = "name" | "type" | "location" | "resourceGroup" | "subscriptionId";

export interface ResourceQuery {
  tenantId: string;
  subscriptionIds: string[];
  filters?: ResourceFilters;
  sort?: { field: SortField; dir: "asc" | "desc" };
  skipToken?: string;
  /** Epoch ms; cached data older than this is refetched from Azure. */
  freshAfter?: number;
}

export interface ResourcePage {
  rows: ResourceRow[];
  skipToken?: string;
  totalRecords: number;
}

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

export interface SummaryQuery {
  tenantId: string;
  subscriptionIds: string[];
  filters?: ResourceFilters;
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
