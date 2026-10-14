import type {
  ApiError,
  Cached,
  ResourceDetails,
  ResourceGroup,
  ResourcePage,
  ResourceQuery,
  Subscription,
  Summary,
  SummaryQuery,
  Tenant,
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
  resources: (query: ResourceQuery) => request<Cached<ResourcePage>>("/api/resources/query", post(query)),
  summary: (query: SummaryQuery) => request<Cached<Summary>>("/api/summary", post(query)),
  details: (tenantId: string, id: string, freshAfter?: number) =>
    request<Cached<ResourceDetails>>(
      `/api/resources/details?${new URLSearchParams({ tenantId, id, ...(freshAfter ? { freshAfter: String(freshAfter) } : {}) })}`,
    ),
  exportUrl: (query: ResourceQuery, format: "csv" | "json") => {
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(query))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return `/api/export?${new URLSearchParams({ q: encoded, format, token })}`;
  },
};
