import type {
  ActivityQuery,
  ActivityResult,
  ApiError,
  Cached,
  ResourceDetails,
  ResourceGroup,
  Snapshot,
  SnapshotQuery,
  Subscription,
  Tenant,
  VaultAudit,
  AuditFilters,
  VaultSecret,
  VaultSecretVersion,
} from "../../shared/types";

const TOKEN_KEY = "lupa-token";

/** The session token arrives in the URL hash once; keep it for this tab and clean the URL. */
function sessionToken(): string {
  const match = location.hash.match(/token=([\w-]+)/);
  if (match?.[1]) {
    try {
      sessionStorage.setItem(TOKEN_KEY, match[1]);
    } catch {
      // storage unavailable; token stays in memory below
    }
    history.replaceState(null, "", location.pathname + location.search);
    return match[1];
  }
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "dev";
  } catch {
    return "dev";
  }
}

export const token = sessionToken();

export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public hint?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "x-lupa-token": token, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as ApiError;
    throw new RequestError(body.error, res.status, body.code, body.hint);
  }
  return (await res.json()) as T;
}

const q = (freshAfter?: number) => (freshAfter ? `?freshAfter=${freshAfter}` : "");
const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

export const api = {
  tenants: (freshAfter?: number) => request<Cached<Tenant[]>>(`/api/tenants${q(freshAfter)}`),
  subscriptions: (tenantId: string, freshAfter?: number) =>
    request<Cached<Subscription[]>>(`/api/tenants/${tenantId}/subscriptions${q(freshAfter)}`),
  resourceGroups: (tenantId: string, subscriptionId: string, freshAfter?: number) =>
    request<Cached<ResourceGroup[]>>(
      `/api/tenants/${tenantId}/subscriptions/${subscriptionId}/resource-groups${q(freshAfter)}`,
    ),
  snapshot: (query: SnapshotQuery) => request<Cached<Snapshot>>("/api/snapshot", post(query)),
  activity: ({ tenantId, id, range }: ActivityQuery, signal: AbortSignal) =>
    request<ActivityResult>(`/api/logs/activity?${new URLSearchParams({ tenantId, id, range })}`, {
      signal,
      cache: "no-store",
    }),
  details: (tenantId: string, id: string, freshAfter?: number) =>
    request<Cached<ResourceDetails>>(
      `/api/resources/details?${new URLSearchParams({ tenantId, id, ...(freshAfter ? { freshAfter: String(freshAfter) } : {}) })}`,
    ),
};

export function requestVault<T>(path: string, params: Record<string, string>, signal: AbortSignal) {
  return request<T>(`/api/key-vault/${path}?${new URLSearchParams(params)}`, { signal });
}

export const vaultApi = {
  secrets: (tenantId: string, id: string, signal: AbortSignal) =>
    requestVault<VaultSecret[]>("secrets", { tenantId, id }, signal),
  versions: (tenantId: string, id: string, name: string, signal: AbortSignal) =>
    requestVault<VaultSecretVersion[]>("secret-versions", { tenantId, id, name }, signal),
  audit: (tenantId: string, id: string, filters: AuditFilters, signal: AbortSignal, resolvePrincipals = false) => {
    const params = auditParams(tenantId, id, filters);
    for (const action of filters.actions ?? []) params.append("actions", action);
    if (resolvePrincipals) params.set("resolvePrincipals", "true");
    return request<VaultAudit>(`/api/key-vault/audit-logs?${params}`, { signal });
  },
  actions: (tenantId: string, id: string, period: AuditFilters, signal: AbortSignal) =>
    request<{ actions: string[]; partial: boolean }>(
      `/api/key-vault/audit-actions?${auditParams(tenantId, id, period)}`,
      { signal },
    ),
};

function auditParams(tenantId: string, id: string, { range, from, to }: AuditFilters) {
  const params = new URLSearchParams({ tenantId, id, range });
  if (range === "custom" && from && to) {
    params.set("from", from);
    params.set("to", to);
  }
  return params;
}
