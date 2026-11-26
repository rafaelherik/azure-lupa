import { afterEach, describe, expect, it, vi } from "vitest";
import type { Inventory } from "../src/server/azure/inventory.js";
import { listVaultSecrets, listVaultVersions, vaultActions, vaultAudit } from "../src/server/azure/keyVault.js";

vi.mock("../src/server/azure/credentials.js", () => ({ getToken: async () => "test-token" }));

const tenant = "00000000-0000-0000-0000-000000000001";
const id =
  "/subscriptions/00000000-0000-0000-0000-000000000002/resourceGroups/test/providers/Microsoft.KeyVault/vaults/test-vault";
const origin = "https://test-vault.vault.azure.net";
const inventory: Pick<Inventory, "details"> = {
  details: async () => ({
    cachedAt: 0,
    fromCache: false,
    data: { apiVersion: "test", resource: { properties: { vaultUri: `${origin}/` } } },
  }),
};

afterEach(() => vi.unstubAllGlobals());

describe("Key Vault metadata", () => {
  it("paginates, sorts by update time and projects metadata only", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          value: [{ id: `${origin}/secrets/unknown` }, { id: `${origin}/secrets/older`, attributes: { updated: 1 } }],
          nextLink: `${origin}:443/secrets?$skiptoken=next`,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          value: [{ id: `${origin}/secrets/latest`, attributes: { updated: 2 }, value: "excluded" }],
        }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(listVaultSecrets(inventory, tenant, id)).resolves.toEqual([
      { name: "latest", updated: "1970-01-01T00:00:02.000Z" },
      { name: "older", updated: "1970-01-01T00:00:01.000Z" },
      { name: "unknown" },
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["https://example.net/secrets", `${origin}/secrets/secret`])("rejects continuation %s", async (nextLink) => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ value: [], nextLink }));
    vi.stubGlobal("fetch", fetch);
    await expect(listVaultSecrets(inventory, tenant, id)).rejects.toMatchObject({ code: "BadVaultContinuation" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns versions in creation order", async () => {
    const older = "a".repeat(32);
    const newer = "b".repeat(32);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          value: [
            { id: `${origin}/secrets/example/${older}`, attributes: { created: 1, updated: 5 } },
            { id: `${origin}/secrets/example/${newer}`, attributes: { created: 2 } },
          ],
        }),
      ),
    );
    const result = await listVaultVersions(inventory, tenant, id, "example");
    expect(result.map(({ version }) => version)).toEqual([newer, older]);
  });
});

describe("Key Vault audit logs", () => {
  it("maps named columns and reports partial and capped results", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        tables: [
          {
            name: "PrimaryResult",
            columns: ["ResultType", "TimeGenerated", "OperationName"].map((name) => ({ name })),
            rows: Array.from({ length: 101 }, () => ["Success", "2026-11-25T00:00:00Z", "SecretList"]),
          },
        ],
        error: { code: "PartialError" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await vaultAudit(tenant, id, "7d");
    expect(result).toMatchObject({ capped: true, partial: true });
    expect(result.events).toHaveLength(100);
    expect(result.events[0]).toEqual({ time: "2026-11-25T00:00:00Z", operation: "SecretList", result: "Success" });
    expect(JSON.parse(fetch.mock.calls[0]![1].body).timespan).toBe("P7D");
  });

  it("prefers a UPN, then object ID, then application ID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          tables: [
            {
              name: "PrimaryResult",
              columns: ["Upn", "ObjectId", "AppId"].map((name) => ({ name })),
              rows: [
                ["reader@example.com", "object", "app"],
                ["", "object", "app"],
                ["", "", "app"],
                ["", "", ""],
              ],
            },
          ],
        }),
      ),
    );
    const { events } = await vaultAudit(tenant, id, "24h");
    expect(events.map(({ principal, principalType }) => [principal, principalType])).toEqual([
      ["reader@example.com", "upn"],
      ["object", "objectId"],
      ["app", "appId"],
      [undefined, undefined],
    ]);
  });

  it("preserves Azure access errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: { code: "InsufficientAccessError" },
          },
          { status: 403 },
        ),
      ),
    );
    await expect(vaultAudit(tenant, id, "24h")).rejects.toMatchObject({ status: 403, code: "InsufficientAccessError" });
  });

  it("resolves distinct callers in batches and keeps unresolved IDs in event order", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
    const [user, managed, app] = ids;
    const rows = [
      ["recorded@example.com", ids[3], app],
      ["", user, app],
      ["", user, app],
      ["", managed, ""],
      ["", "", app],
      ...ids.slice(4).map((id) => ["", id, app]),
    ];
    const urls: string[] = [];
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      if (!url.startsWith("https://graph.microsoft.com/")) return auditRows(rows);
      expect(url).toBe("https://graph.microsoft.com/v1.0/$batch");
      const { requests } = JSON.parse(String(init.body)) as { requests: { id: string; url: string }[] };
      expect(requests.length).toBeLessThanOrEqual(20);
      const responses = requests.map(({ id, url }) => {
        urls.push(url);
        if (url === `/users/${user}?$select=userPrincipalName`) {
          return { id, status: 200, body: { userPrincipalName: "alex@example.com" } };
        }
        if (url === `/servicePrincipals/${managed}?$select=displayName`) {
          return { id, status: 200, body: { displayName: "backup-identity" } };
        }
        if (url === `/servicePrincipals(appId='${app}')?$select=displayName`) {
          return { id, status: 200, body: { displayName: "backup-app" } };
        }
        return { id, status: 403 };
      });
      return Response.json({ responses: responses.reverse() });
    });
    vi.stubGlobal("fetch", fetch);
    const { events } = await vaultAudit(tenant, id, "24h", true);
    expect(events.map((e) => e.principal)).toEqual(["recorded@example.com", user, user, managed, app, ...ids.slice(4)]);
    expect(events.map((e) => e.principalName)).toEqual([
      undefined,
      "alex@example.com",
      "alex@example.com",
      "backup-identity",
      "backup-app",
      ...ids.slice(4).map(() => undefined),
    ]);
    expect(urls).toHaveLength(21);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.some((url) => url.includes(ids[3]!))).toBe(false);
  });

  it("preserves audit events when Graph is unavailable", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(auditRows([["", tenant, ""]]))
      .mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetch);
    const result = await vaultAudit(tenant, id, "24h", true);
    expect(result.events[0]).toMatchObject({ principal: tenant, principalType: "objectId" });
    expect(result.events[0]).not.toHaveProperty("principalName");
  });

  it("skips Graph for recorded UPNs and when resolution is disabled", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(auditRows([["alex@example.com", tenant, ""]]))
      .mockResolvedValueOnce(auditRows([["", tenant, ""]]));
    vi.stubGlobal("fetch", fetch);
    await vaultAudit(tenant, id, "24h", true);
    await vaultAudit(tenant, id, "24h");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every(([url]) => url.startsWith("https://api.loganalytics.azure.com/"))).toBe(true);
  });
});

function auditRows(rows: unknown[][]) {
  return Response.json({
    tables: [{ name: "PrimaryResult", columns: ["Upn", "ObjectId", "AppId"].map((name) => ({ name })), rows }],
  });
}

describe("audit filters", () => {
  it.each([
    ["1h", "PT1H"],
    ["6h", "PT6H"],
    ["24h", "PT24H"],
    ["7d", "P7D"],
    ["30d", "P30D"],
  ] as const)("queries %s with exact actions before the cap", async (range, duration) => {
    const fetch = vi.fn().mockResolvedValue(auditRows([]));
    vi.stubGlobal("fetch", fetch);
    await vaultAudit(tenant, id, range, false, { actions: ["SecretGet", "SecretSet"] });
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.timespan).toBe(duration);
    expect(body.query).toMatch(/where OperationName in .*"SecretGet","SecretSet".*\n\| top 101/);
  });
  it("discovers actions across the whole selected UTC day", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ tables: [{ name: "PrimaryResult", rows: [["KeyDelete"]] }] }));
    vi.stubGlobal("fetch", fetch);
    await expect(vaultActions(tenant, id, { range: "custom", from: "2024-02-29", to: "2024-02-29" })).resolves.toEqual({
      actions: ["KeyDelete"],
      partial: false,
    });
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.timespan).toBe("2024-02-29T00:00:00Z/2024-03-01T00:00:00.000Z");
    expect(body.query).toContain("TimeGenerated < datetime(2024-03-01");
    expect(body.query).toContain("distinct OperationName");
    expect(body.query).not.toContain("top 101");
  });
  it.each([
    ["2025-02-29", "2025-03-01"],
    ["2025-03-02", "2025-03-01"],
    ["2025-03-01", undefined],
  ])("rejects invalid interval %s through %s", async (from, to) => {
    await expect(vaultAudit(tenant, id, "custom", false, { from, to })).rejects.toMatchObject({ status: 400 });
  });
});
