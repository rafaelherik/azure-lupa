import pLimit from "p-limit";
import { getToken } from "./credentials.js";
import { log } from "../log.js";

export const ARM = "https://management.azure.com";

const MAX_CONCURRENCY = 4;
const MAX_RETRIES = 5;
const limit = pLimit(MAX_CONCURRENCY);

/** In-flight identical requests share one Azure call. */
const inflight = new Map<string, Promise<unknown>>();

export class AzureError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public hint?: string,
  ) {
    super(message);
  }
}

export interface ArmRequest {
  tenantId?: string;
  method?: "GET" | "POST";
  path: string;
  body?: unknown;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Delay before the next attempt: honor Retry-After, else exponential backoff with jitter. */
export function retryDelayMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 60_000);
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(0, Math.min(date - Date.now(), 60_000));
  }
  const base = 500 * 2 ** attempt;
  return Math.min(base + Math.random() * base * 0.5, 30_000);
}

/** Resource Graph reports quota reset as "hh:mm:ss". */
function quotaResetSeconds(value: string | null): string | null {
  if (!value) return null;
  const [h = 0, m = 0, s = 0] = value.split(":").map(Number);
  return String(h * 3600 + m * 60 + s);
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export async function armFetch<T>(req: ArmRequest, fetchImpl: typeof fetch = fetch): Promise<T> {
  const key = `${req.tenantId ?? ""}|${req.method ?? "GET"}|${req.path}|${JSON.stringify(req.body ?? null)}`;
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = limit(() => doFetch<T>(req, fetchImpl)).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

async function doFetch<T>(req: ArmRequest, fetchImpl: typeof fetch): Promise<T> {
  const url = req.path.startsWith("http") ? req.path : ARM + req.path;
  for (let attempt = 0; ; attempt++) {
    const token = await getToken(req.tenantId);
    const started = Date.now();
    const res = await fetchImpl(url, {
      method: req.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "azure-lupa",
      },
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
    });
    log.debug(`${req.method ?? "GET"} ${url.replace(ARM, "")} → ${res.status} (${Date.now() - started}ms)`);

    const remaining =
      res.headers.get("x-ms-user-quota-remaining") ?? res.headers.get("x-ms-ratelimit-remaining-tenant-reads");
    if (remaining && Number(remaining) < 5) {
      log.debug(`quota nearly exhausted (${remaining} left), slowing down`);
      await sleep(retryDelayMs(1, quotaResetSeconds(res.headers.get("x-ms-user-quota-resets-after"))));
    }

    if (res.ok) return (await res.json()) as T;

    if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
      const delay = retryDelayMs(attempt, res.headers.get("retry-after"));
      log.debug(`retrying in ${Math.round(delay)}ms`);
      await sleep(delay);
      continue;
    }

    let code: string | undefined;
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code;
      if (body.error?.message) message = body.error.message;
    } catch {
      // non-JSON error body
    }
    throw new AzureError(message, res.status, code);
  }
}
