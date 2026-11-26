import type { ServerResponse } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/server/app.js";
import { getToken } from "../src/server/azure/credentials.js";
import { AzureError } from "../src/server/azure/http.js";
import { Cache } from "../src/server/cache.js";
import type { ActivityResult } from "../src/shared/types.js";

vi.mock("../src/server/azure/credentials.js", () => ({ getToken: vi.fn() }));

const tenantId = "00000000-0000-0000-0000-000000000001";
const subscription = "00000000-0000-0000-0000-000000000002";
const origin = "https://management.azure.com";
const path = `/subscriptions/${subscription}/providers/Microsoft.Insights/eventtypes/management/values`;
const parent = `/subscriptions/${subscription}/resourceGroups/MyGroup/providers/Microsoft.Sql/servers/Main`;
const id = `${parent}/databases/Customer's DB`;
const now = new Date("2026-11-26T12:00:00.000Z");
const timestamp = "2026-11-26T11:35:24.000Z";

const fetchAzure = vi.fn<typeof fetch>();
const token = vi.mocked(getToken);
let app: Awaited<ReturnType<typeof buildApp>>;
let rawReply: ServerResponse;

beforeAll(async () => {
  app = await buildApp({ cache: new Cache({ dir: "/unused-lupa-activity-cache" }), token: "local-token" });
  app.addHook("onRequest", async (_request, reply) => {
    rawReply = reply.raw;
  });
});
afterAll(async () => app.close());
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now.getTime());
  vi.stubGlobal("fetch", fetchAzure);
  fetchAzure.mockReset().mockImplementation(async () => Response.json({ value: [] }));
  token.mockReset().mockResolvedValue("arm-token");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function inject(
  query: Record<string, string | undefined> = {},
  headers = { host: "localhost", "x-lupa-token": "local-token" },
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ tenantId, id, range: "1h", ...query })) {
    if (value !== undefined) params.set(key, value);
  }
  return app.inject({ method: "GET", url: `/api/logs/activity?${params}`, headers });
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    resourceId: id,
    eventTimestamp: timestamp,
    operationName: { value: "Microsoft.Sql/servers/databases/write" },
    status: { value: "Succeeded" },
    caller: "caller@example.org",
    ...overrides,
  };
}

function delayed<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

describe("GET /api/logs/activity", () => {
  it.each([
    [{ host: "localhost", "x-lupa-token": "bad-token" }, 401],
    [{ host: "example.org", "x-lupa-token": "local-token" }, 403],
  ])("applies the local request guard before Azure access", async (headers, status) => {
    const response = await inject({}, headers);
    expect(response.statusCode).toBe(status);
    expect(response.json()).not.toHaveProperty("code");
    expect(token).not.toHaveBeenCalled();
    expect(fetchAzure).not.toHaveBeenCalled();
  });

  it.each([
    { tenantId: undefined },
    { tenantId: "bad-tenant" },
    { tenantId: `${tenantId}\n` },
    { range: undefined },
    { range: "6h" },
    { id: undefined },
    { id: "a".repeat(2049) },
    { id: `https://management.azure.com${id}` },
    { id: id.replace(subscription, "bad-subscription") },
    { id: `/subscriptions/${subscription}` },
    { id: `${parent}/databases` },
    { id: `${parent}//databases/name` },
    { id: `${parent}/databases/..` },
    { id: `${parent}/databases/%2Fchild` },
    { id: `${parent}?query=invalid` },
  ])("rejects invalid input before Azure access (%j)", async (query) => {
    expect((await inject(query)).statusCode).toBe(400);
    expect(token).not.toHaveBeenCalled();
    expect(fetchAzure).not.toHaveBeenCalled();
  });

  it.each([
    ["1h", "2026-11-26T11:00:00.000Z"],
    ["24h", "2026-11-25T12:00:00.000Z"],
    ["7d", "2026-11-19T12:00:00.000Z"],
  ])("uses the fixed Activity Log endpoint and an escaped UTC filter for %s", async (range, from) => {
    const response = await inject({ range });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json<ActivityResult>()).toEqual({
      resourceId: id,
      from,
      to: now.toISOString(),
      events: [],
      incomplete: null,
    });
    expect(token).toHaveBeenCalledExactlyOnceWith(tenantId);
    expect(fetchAzure).toHaveBeenCalledTimes(1);
    const [request, options] = fetchAzure.mock.calls[0]!;
    const url = new URL(String(request));
    expect(url.origin).toBe(origin);
    expect(url.pathname).toBe(path);
    expect(url.searchParams.get("api-version")).toBe("2015-04-01");
    expect(url.searchParams.get("$filter")).toBe(
      `eventTimestamp ge '${from}' and eventTimestamp le '${now.toISOString()}' and resourceUri eq '${id.replace(/'/g, "''")}'`,
    );
    expect(options).toMatchObject({ redirect: "error", headers: { authorization: "Bearer arm-token" } });
  });

  it.each([
    `/subscriptions/${subscription}/providers/Microsoft.Authorization/roleAssignments/example`,
    `${id}/providers/Microsoft.Insights/diagnosticSettings/example`,
    `/subscriptions/${subscription}/resourceGroups/MyGroup`,
  ])("accepts and scopes real ARM paths (%s)", async (id) => {
    const response = await inject({ id });
    expect(response.statusCode).toBe(200);
    expect(response.json<ActivityResult>().resourceId).toBe(id);
  });

  it("returns only exact matches across pages, with normalized fields sorted newest first", async () => {
    const eventSuffix = "/events/00000000-0000-0000-0000-000000000003/ticks/638997800000000000";
    fetchAzure
      .mockResolvedValueOnce(
        Response.json({
          value: [
            event({ resourceId: id.toUpperCase(), claims: { sensitive: "omit me" } }),
            event({ resourceId: `${parent}/databases/other` }),
            event({ resourceId: parent }),
            event({ resourceId: `${id}/providers/Microsoft.Insights/diagnosticSettings/test` }),
            event({ resourceId: `${id}/` }),
            event({ eventTimestamp: "2026-11-26T12:15:00Z" }),
            event({ resourceId: parent, id: `${id}${eventSuffix}` }),
          ],
          nextLink: `${origin}${path.toLowerCase()}?$skiptoken=opaque%2Bvalue`,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          value: [
            event({
              resourceId: id.toUpperCase(),
              eventTimestamp: "2026-11-26T06:55:24.1234567-05:00",
              operationName: { localizedValue: " Write database ", value: "ignored" },
              status: " Failed ",
              caller: null,
            }),
            event({ eventTimestamp: "2026-11-26T11:00:00Z", operationName: "start", status: null, caller: 2 }),
          ],
        }),
      );

    const response = await inject();
    expect(response.statusCode).toBe(200);
    expect(response.json<ActivityResult>()).toMatchObject({
      incomplete: null,
      events: [
        { time: "2026-11-26T11:55:24.1234567Z", operation: "Write database", status: "Failed", caller: "" },
        {
          time: timestamp,
          operation: "Microsoft.Sql/servers/databases/write",
          status: "Succeeded",
          caller: "caller@example.org",
        },
        { time: "2026-11-26T11:00:00.000Z", operation: "start", status: "", caller: "" },
      ],
    });
    expect(response.body).not.toContain("omit me");
    expect(fetchAzure).toHaveBeenCalledTimes(2);
    expect(fetchAzure.mock.calls[1]![0]).toBe(
      `${origin}${path.toLowerCase()}?$skiptoken=opaque%2Bvalue&api-version=2015-04-01`,
    );
    expect(token).toHaveBeenCalledTimes(1);
  });

  it("sorts same-millisecond events by full precision and enforces the exact upper bound", async () => {
    fetchAzure.mockResolvedValueOnce(
      Response.json({
        value: [
          "2026-11-26T11:35:24.1234000Z",
          "2026-11-26T11:35:24.1230000Z",
          "2026-11-26T11:35:24.1234001Z",
          "2026-11-26T11:35:24.1230001Z",
          "2026-11-26T07:00:00.0000001-05:00",
          "2026-11-26T07:00:00.0000000-05:00",
          "2026-11-26T11:59:59.9999999Z",
        ].map((eventTimestamp) => event({ eventTimestamp })),
      }),
    );
    const result = (await inject()).json<ActivityResult>();
    expect(result.incomplete).toBeNull();
    expect(result.events.map(({ time }) => time)).toEqual([
      "2026-11-26T12:00:00.000Z",
      "2026-11-26T11:59:59.9999999Z",
      "2026-11-26T11:35:24.1234001Z",
      "2026-11-26T11:35:24.1234Z",
      "2026-11-26T11:35:24.1230001Z",
      "2026-11-26T11:35:24.123Z",
    ]);
  });

  it("reports malformed rows while keeping usable events", async () => {
    fetchAzure.mockResolvedValue(
      Response.json({
        value: [
          null,
          event({ eventTimestamp: "2026-11-26" }),
          event({
            resourceId: undefined,
            id: `${id}/events/00000000-0000-0000-0000-000000000003/ticks/638997800000000000`,
          }),
          event(),
        ],
      }),
    );
    const response = await inject();
    expect(response.statusCode).toBe(200);
    expect(response.json<ActivityResult>()).toMatchObject({
      incomplete: "invalid-event",
      events: [{ time: timestamp }],
    });
    expect(response.json<ActivityResult>().events).toHaveLength(1);
  });

  it.each([
    `https://example.org${path}?$skiptoken=wrong`,
    `http://management.azure.com${path}?$skiptoken=wrong`,
    `https://management.azure.com:8443${path}?$skiptoken=wrong`,
    `https://user@management.azure.com${path}?$skiptoken=wrong`,
    `${path}/extra?$skiptoken=wrong`,
    `${path.replace(subscription, tenantId)}?$skiptoken=wrong`,
    `?$skiptoken=wrong#fragment`,
    `?$skiptoken=wrong&api-version=2022-01-01`,
    123,
  ])("reports an invalid continuation and never requests it (%s)", async (nextLink) => {
    fetchAzure.mockResolvedValueOnce(Response.json({ value: [event()], nextLink }));
    const response = await inject();
    expect(response.statusCode).toBe(200);
    expect(response.json<ActivityResult>()).toMatchObject({
      incomplete: "invalid-continuation",
      events: [{ time: timestamp }],
    });
    expect(fetchAzure).toHaveBeenCalledTimes(1);
  });

  it("ends a pagination cycle even when the continuation query order changes", async () => {
    fetchAzure
      .mockResolvedValueOnce(Response.json({ value: [], nextLink: "?$skiptoken=repeat&api-version=2015-04-01" }))
      .mockResolvedValueOnce(Response.json({ value: [], nextLink: "?api-version=2015-04-01&%24skiptoken=repeat" }));
    expect((await inject()).json<ActivityResult>().incomplete).toBe("invalid-continuation");
    expect(fetchAzure).toHaveBeenCalledTimes(2);
  });

  it("stops after ten pages with a continuation still pending", async () => {
    let pages = 0;
    fetchAzure.mockImplementation(async () => Response.json({ value: [], nextLink: `?$skiptoken=${++pages}` }));
    expect((await inject()).json<ActivityResult>().incomplete).toBe("page-limit");
    expect(fetchAzure).toHaveBeenCalledTimes(10);
  });

  it.each([
    [500, undefined, null],
    [500, "?$skiptoken=more", "event-limit"],
    [501, undefined, "event-limit"],
  ])("returns the newest 500 and marks truncation when needed (%i, %s)", async (count, nextLink, incomplete) => {
    const start = Date.parse(timestamp);
    const value = Array.from({ length: count }, (_, index) =>
      event({ eventTimestamp: new Date(start + index).toISOString() }),
    );
    fetchAzure.mockResolvedValueOnce(Response.json({ value, nextLink }));
    const response = await inject();
    expect(response.statusCode).toBe(200);
    const result = response.json<ActivityResult>();
    expect(result.incomplete).toBe(incomplete);
    expect(result.events).toHaveLength(500);
    expect(result.events[0]?.time).toBe(value.at(-1)?.eventTimestamp);
    expect(result.events[499]?.time).toBe(value[count - 500]?.eventTimestamp);
    expect(fetchAzure).toHaveBeenCalledTimes(1);
  });

  it.each([
    [302, 502, "ActivityUpstreamError"],
    [401, 401, "ActivityUnauthorized"],
    [403, 403, "ActivityForbidden"],
    [429, 429, "ActivityThrottled"],
    [504, 504, "ActivityTimeout"],
    [503, 502, "ActivityUpstreamError"],
  ])("maps Azure HTTP %i to local %i with a stable code", async (upstream, status, code) => {
    fetchAzure.mockResolvedValueOnce(
      new Response("private upstream details", { status: upstream, headers: { location: "https://example.org" } }),
    );
    const response = await inject();
    expect(response.statusCode).toBe(status);
    expect(response.json()).toHaveProperty("code", code);
    expect(response.body).not.toContain("private upstream details");
    expect(response.body).not.toContain("example.org");
    expect(fetchAzure).toHaveBeenCalledTimes(1);
  });

  it("returns the Azure CLI credential error when login fails", async () => {
    token.mockRejectedValueOnce(new AzureError("Token unavailable", 401, "CliCredentialError", "Run az login"));
    const response = await inject();
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Token unavailable", code: "CliCredentialError", hint: "Run az login" });
    expect(fetchAzure).not.toHaveBeenCalled();
  });

  it("returns 502 for an invalid first page", async () => {
    fetchAzure.mockResolvedValueOnce(Response.json({ value: null }));
    const response = await inject();
    expect(response.statusCode).toBe(502);
    expect(response.json()).toHaveProperty("code", "ActivityUpstreamError");
  });

  it("keeps events when a later page fails", async () => {
    fetchAzure
      .mockResolvedValueOnce(Response.json({ value: [event()], nextLink: "?$skiptoken=next" }))
      .mockRejectedValueOnce(new Error("private upstream details"));
    const response = await inject();
    expect(response.statusCode).toBe(200);
    expect(response.json<ActivityResult>()).toMatchObject({
      incomplete: "upstream-error",
      events: [{ time: timestamp }],
    });
    expect(response.body).not.toContain("private upstream details");
  });

  it.each([
    [401, "sign-in"],
    [403, "access-denied"],
    [429, "throttled"],
  ])("keeps events and reports a specific reason for later Azure HTTP %i", async (status, incomplete) => {
    fetchAzure
      .mockResolvedValueOnce(Response.json({ value: [event()], nextLink: "?$skiptoken=next" }))
      .mockResolvedValueOnce(new Response(null, { status }));
    const response = await inject();
    expect(response.statusCode).toBe(200);
    expect(response.json<ActivityResult>()).toMatchObject({ incomplete, events: [{ time: timestamp }] });
  });

  it.each(["credential", "page"])("cancels pending %s work on premature response close", async (stage) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const started = delayed<void>();
    const credential = delayed<string>();
    const body = delayed<unknown>();
    if (stage === "credential") {
      token.mockImplementationOnce(() => {
        started.resolve();
        return credential.promise;
      });
    } else {
      const pendingPage = Response.json({ value: [] });
      vi.spyOn(pendingPage, "json").mockImplementationOnce(() => {
        started.resolve();
        return body.promise;
      });
      fetchAzure
        .mockResolvedValueOnce(Response.json({ value: [event()], nextLink: "?$skiptoken=next" }))
        .mockResolvedValueOnce(pendingPage);
    }
    const response = expect(inject()).rejects.toMatchObject({ code: "LIGHT_ECONNRESET" });
    await started.promise;
    rawReply.destroy();
    await response;
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    if (stage === "page") expect(fetchAzure.mock.calls[1]![1]?.signal?.aborted).toBe(true);

    credential.resolve("late-token");
    body.resolve({ value: [], nextLink: "?$skiptoken=late" });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchAzure).toHaveBeenCalledTimes(stage === "page" ? 2 : 0);
  });

  it("includes credential acquisition in the total deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const started = delayed<void>();
    const credential = delayed<string>();
    token.mockImplementationOnce(() => {
      started.resolve();
      return credential.promise;
    });
    const response = inject();
    await started.promise;
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await response).statusCode).toBe(504);
    credential.resolve("late-token");
    expect(fetchAzure).not.toHaveBeenCalled();
  });

  it("shares the deadline across login, request pages and body reads", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const loginStarted = delayed<void>();
    const credential = delayed<string>();
    const bodyStarted = delayed<void>();
    const unreadableBody = Response.json({ value: [] });
    vi.spyOn(unreadableBody, "json").mockImplementation(() => {
      bodyStarted.resolve();
      return new Promise(() => {});
    });
    token.mockImplementationOnce(() => {
      loginStarted.resolve();
      return credential.promise;
    });
    fetchAzure
      .mockResolvedValueOnce(Response.json({ value: [event()], nextLink: "?$skiptoken=next" }))
      .mockResolvedValueOnce(unreadableBody);
    const response = inject();
    await loginStarted.promise;
    await vi.advanceTimersByTimeAsync(10_000);
    credential.resolve("arm-token");
    await bodyStarted.promise;
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await response).json<ActivityResult>()).toMatchObject({
      incomplete: "timeout",
      events: [{ time: timestamp }],
    });
    expect(fetchAzure.mock.calls[1]![1]?.signal?.aborted).toBe(true);
  });
});
