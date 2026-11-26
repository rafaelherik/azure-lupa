import type { ActivityQuery, ActivityRange, ActivityResult } from "../../shared/types.js";
import { getToken } from "./credentials.js";
import { ARM, AzureError } from "./http.js";

const API_VERSION = "2015-04-01";
const MAX_EVENTS = 500;
const MAX_PAGES = 10;
const TIMEOUT_MS = 15_000;
const HOUR_MS = 3_600_000;
const RANGE_HOURS: Record<ActivityRange, number> = { "1h": 1, "24h": 24, "7d": 168 };
const PAGE_FAILURES: Partial<Record<number, ActivityResult["incomplete"]>> = {
  401: "sign-in",
  403: "access-denied",
  429: "throttled",
  504: "timeout",
};

const GUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const PROVIDER = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/i;
const RESOURCE_TYPE = /^[a-z][a-z0-9_.-]*$/i;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3}(\d*))?(?:Z|[+-]\d{2}:\d{2})$/i;

interface ActivityRow {
  resourceId?: unknown;
  eventTimestamp?: unknown;
  operationName?: unknown;
  status?: unknown;
  caller?: unknown;
}

function parseSubscription(id: string): string | undefined {
  if (!id.startsWith("/") || /[\\?#\p{Cc}]|%2f|%5c/iu.test(id)) return;
  const parts = id.slice(1).split("/");
  if (parts.some((part) => !part.trim() || part === "." || part === "..")) return;
  const [scope, subscription] = parts;
  if (scope?.toLowerCase() !== "subscriptions" || !subscription || !GUID.test(subscription)) return;
  const hasGroup = parts[2]?.toLowerCase() === "resourcegroups";
  if (hasGroup && parts.length === 4) return subscription;
  let index = hasGroup ? 4 : 2;
  do {
    if (parts[index]?.toLowerCase() !== "providers" || !PROVIDER.test(parts[index + 1] ?? "")) return;
    index += 2;
    do {
      if (!RESOURCE_TYPE.test(parts[index] ?? "") || !parts[index + 1]) return;
      index += 2;
    } while (index < parts.length && parts[index]?.toLowerCase() !== "providers");
  } while (index < parts.length);
  return subscription;
}

function activityUrl(path: string, { resourceId, from, to }: ActivityResult) {
  const url = new URL(path, ARM);
  url.searchParams.set("api-version", API_VERSION);
  // OData escapes an apostrophe by doubling it inside a string literal.
  const resource = resourceId.replace(/'/g, "''");
  url.searchParams.set(
    "$filter",
    `eventTimestamp ge '${from}' and eventTimestamp le '${to}' and resourceUri eq '${resource}'`,
  );
  return url;
}

function continuation(link: unknown, initial: URL): URL | undefined {
  if (typeof link !== "string" || /[\s\\#]/.test(link)) return;
  // Allow Azure's absolute and relative links, bound to this subscription's Activity Log collection.
  try {
    const url = new URL(link, initial);
    if (
      url.origin !== initial.origin ||
      url.username ||
      url.password ||
      url.pathname.toLowerCase() !== initial.pathname.toLowerCase()
    )
      return;
    const versions = url.searchParams.getAll("api-version");
    if (versions.length === 0) url.search += `${url.search ? "&" : "?"}api-version=${API_VERSION}`;
    else if (versions.length !== 1 || versions[0] !== API_VERSION) return;
    return url;
  } catch {
    return;
  }
}

function continuationKey(url: URL): string {
  const query = new URLSearchParams(url.search);
  query.sort();
  return url.pathname.toLowerCase() + "?" + query.toString();
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function label(value: unknown): string {
  if (!value || typeof value !== "object") return text(value);
  const localized = value as { localizedValue?: unknown; value?: unknown };
  return text(localized.localizedValue) || text(localized.value);
}

function normalizeTime(timestamp: string): string | undefined {
  const match = RFC3339.exec(timestamp);
  if (!match || timestamp.slice(11, 13) === "24") return;
  const date = timestamp.slice(0, 10);
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed) || !new Date(`${date}T00:00:00Z`).toJSON()?.startsWith(date)) return;
  const extra = (match[1] ?? "").replace(/0+$/, "");
  return new Date(parsed).toISOString().slice(0, -1) + extra + "Z";
}

function compareTime(a: string, b: string): number {
  // Drop Z so a shorter fractional prefix sorts before the same prefix with more precision.
  const left = a.slice(0, -1);
  const right = b.slice(0, -1);
  return left < right ? -1 : left > right ? 1 : 0;
}

function appendEvents(rows: unknown[], result: ActivityResult) {
  const requested = result.resourceId.toLowerCase();
  for (const value of rows) {
    const row = value as ActivityRow | null;
    const resourceId = row?.resourceId;
    if (typeof resourceId !== "string" || !resourceId) {
      result.incomplete = "invalid-event";
      continue;
    }
    if (resourceId.toLowerCase() !== requested) continue;
    const time = normalizeTime(text(row?.eventTimestamp));
    if (!time) {
      result.incomplete = "invalid-event";
      continue;
    }
    if (compareTime(time, result.from) < 0 || compareTime(time, result.to) > 0) continue;
    result.events.push({
      time,
      operation: label(row?.operationName),
      status: label(row?.status),
      caller: text(row?.caller),
    });
  }
}

function responseError(status: number) {
  switch (status) {
    case 401:
      return new AzureError("Azure did not accept the Activity Log credentials", 401, "ActivityUnauthorized");
    case 403:
      return new AzureError("Azure denied access to this subscription's Activity Log", 403, "ActivityForbidden");
    case 429:
      return new AzureError("Azure is throttling Activity Log requests", 429, "ActivityThrottled");
    case 408:
    case 504:
      return new AzureError("The Activity Log request timed out", 504, "ActivityTimeout");
    default:
      return new AzureError("Could not read the Azure Activity Log", 502, "ActivityUpstreamError");
  }
}

async function fetchPage(url: URL, token: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const response = await fetch(url.href, {
    redirect: "error",
    signal,
    headers: { authorization: `Bearer ${token}`, "user-agent": "azure-lupa" },
  });
  signal.throwIfAborted();
  if (!response.ok || response.redirected) throw responseError(response.status);
  const page = (await response.json()) as { value?: unknown; nextLink?: unknown } | null;
  if (!Array.isArray(page?.value)) throw responseError(502);
  return { value: page.value as unknown[], nextLink: page.nextLink };
}

export async function listActivity(
  { tenantId, id, range }: ActivityQuery,
  client: AbortSignal,
): Promise<ActivityResult> {
  client.throwIfAborted();
  const subscription = parseSubscription(id);
  if (!subscription) throw new AzureError("Select a valid ARM resource", 400, "BadActivityResourceId");

  const now = Date.now();
  const result: ActivityResult = {
    resourceId: id,
    from: new Date(now - RANGE_HOURS[range] * HOUR_MS).toISOString(),
    to: new Date(now).toISOString(),
    events: [],
    incomplete: null,
  };
  const path = `/subscriptions/${subscription}/providers/Microsoft.Insights/eventtypes/management/values`;
  const initial = activityUrl(path, result);
  const deadline = new AbortController();
  const signal = AbortSignal.any([client, deadline.signal]);
  const timer = setTimeout(() => deadline.abort(responseError(504)), TIMEOUT_MS);
  let onAbort!: () => void;
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  const seen = new Set([continuationKey(initial)]);
  let pages = 0;
  try {
    const token = await Promise.race([getToken(tenantId), interrupted]);
    let url = initial;
    while (true) {
      const page = await Promise.race([fetchPage(url, token, signal), interrupted]);
      signal.throwIfAborted();
      pages++;
      appendEvents(page.value, result);
      const more = page.nextLink != null && page.nextLink !== "";
      if (result.events.length > MAX_EVENTS || (result.events.length === MAX_EVENTS && more)) {
        result.incomplete = "event-limit";
        break;
      }
      if (!more) break;
      const next = continuation(page.nextLink, initial);
      if (!next || seen.has(continuationKey(next))) {
        result.incomplete = "invalid-continuation";
        break;
      }
      if (pages === MAX_PAGES) {
        result.incomplete = "page-limit";
        break;
      }
      seen.add(continuationKey(next));
      url = next;
    }
  } catch (error) {
    client.throwIfAborted();
    const cause = signal.aborted ? signal.reason : error;
    const failure = cause instanceof AzureError ? cause : responseError(502);
    if (pages === 0) throw failure;
    result.incomplete = PAGE_FAILURES[failure.status] ?? "upstream-error";
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }

  result.events.sort((a, b) => compareTime(b.time, a.time));
  result.events = result.events.slice(0, MAX_EVENTS);
  return result;
}
