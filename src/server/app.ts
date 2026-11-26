import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyError } from "fastify";
import fastifyStatic from "@fastify/static";
import { vaultRanges, type SnapshotQuery, type VaultLogRange } from "../shared/types.js";
import { AzureError } from "./azure/http.js";
import { Inventory } from "./azure/inventory.js";
import { listVaultSecrets, listVaultVersions, vaultActions, vaultAudit } from "./azure/keyVault.js";
import type { Cache } from "./cache.js";

export interface AppOptions {
  cache: Cache;
  token: string;
  webRoot?: string;
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function defaultWebRoot() {
  // dist/server/cli.js → dist/web
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "web");
}

const GUID = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

const SNAPSHOT_BODY = {
  type: "object",
  required: ["tenantId", "subscriptionIds"],
  additionalProperties: false,
  properties: {
    tenantId: { type: "string", pattern: GUID },
    subscriptionIds: { type: "array", minItems: 1, items: { type: "string", pattern: GUID } },
    freshAfter: { type: "number" },
  },
} as const;

const freshAfter = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined);

export async function buildApp({ cache, token, webRoot = defaultWebRoot() }: AppOptions) {
  const app = Fastify({ logger: false });
  const inventory = new Inventory(cache);

  app.addHook("onRequest", async (req, reply) => {
    // Block DNS-rebinding: only answer requests addressed to a loopback host.
    const host = (req.headers.host ?? "").replace(/:\d+$/, "");
    if (!LOCAL_HOSTS.has(host)) return reply.code(403).send({ error: "Forbidden host" });
    if (!req.url.startsWith("/api/")) return;
    const supplied = req.headers["x-lupa-token"] ?? (req.query as Record<string, string>).token;
    if (supplied !== token)
      return reply.code(401).send({ error: "Invalid session token. Reopen the URL printed by azure-lupa." });
  });

  app.setErrorHandler((err: FastifyError | AzureError, _req, reply) => {
    if (err instanceof AzureError) {
      return reply
        .code(err.status >= 400 && err.status < 600 ? err.status : 502)
        .send({ error: err.message, code: err.code, hint: err.hint });
    }
    return reply.code(err.statusCode ?? 500).send({ error: err.message });
  });

  app.get<{ Querystring: { freshAfter?: string } }>("/api/tenants", (req) =>
    inventory.tenants(freshAfter(req.query.freshAfter)),
  );

  app.get<{ Params: { tid: string }; Querystring: { freshAfter?: string } }>("/api/tenants/:tid/subscriptions", (req) =>
    inventory.subscriptions(req.params.tid, freshAfter(req.query.freshAfter)),
  );

  app.get<{ Params: { tid: string; sid: string }; Querystring: { freshAfter?: string } }>(
    "/api/tenants/:tid/subscriptions/:sid/resource-groups",
    (req) => inventory.resourceGroups(req.params.tid, req.params.sid, freshAfter(req.query.freshAfter)),
  );

  app.post<{ Body: SnapshotQuery }>("/api/snapshot", { schema: { body: SNAPSHOT_BODY } }, (req) =>
    inventory.snapshot(req.body),
  );

  app.get<{ Querystring: { tenantId: string; id: string; freshAfter?: string } }>("/api/resources/details", (req) =>
    inventory.details(req.query.tenantId, req.query.id, freshAfter(req.query.freshAfter)),
  );

  const vaultQuery = {
    tenantId: { type: "string", pattern: GUID },
    id: { type: "string", maxLength: 250 },
  };
  function vaultSchema(extra: Record<string, unknown> = {}, optional: Record<string, unknown> = {}) {
    return {
      querystring: {
        type: "object",
        required: ["tenantId", "id", ...Object.keys(extra)],
        properties: { ...vaultQuery, ...extra, ...optional },
      },
    };
  }
  type VaultQuery = { tenantId: string; id: string };
  app.get<{ Querystring: VaultQuery }>("/api/key-vault/secrets", { schema: vaultSchema() }, ({ query }, reply) => {
    reply.header("Cache-Control", "no-store");
    return listVaultSecrets(inventory, query.tenantId, query.id);
  });
  app.get<{ Querystring: VaultQuery & { name: string } }>(
    "/api/key-vault/secret-versions",
    { schema: vaultSchema({ name: { type: "string", pattern: "^[A-Za-z0-9-]{1,127}$" } }) },
    ({ query }, reply) => {
      reply.header("Cache-Control", "no-store");
      return listVaultVersions(inventory, query.tenantId, query.id, query.name);
    },
  );
  type AuditQuery = VaultQuery & {
    range: VaultLogRange;
    from?: string;
    to?: string;
    actions?: string[];
    resolvePrincipals?: boolean;
  };
  const period = { range: { type: "string", enum: vaultRanges } };
  const dates = { from: { type: "string", format: "date" }, to: { type: "string", format: "date" } };
  app.get<{ Querystring: AuditQuery }>(
    "/api/key-vault/audit-actions",
    { schema: vaultSchema(period, dates) },
    ({ query }, reply) => {
      reply.header("Cache-Control", "no-store");
      return vaultActions(query.tenantId, query.id, query);
    },
  );
  app.get<{ Querystring: AuditQuery }>(
    "/api/key-vault/audit-logs",
    {
      schema: vaultSchema(period, {
        ...dates,
        resolvePrincipals: { type: "boolean" },
        actions: { type: "array", items: { type: "string", minLength: 1, maxLength: 256 } },
      }),
    },
    ({ query }, reply) => {
      reply.header("Cache-Control", "no-store");
      return vaultAudit(query.tenantId, query.id, query.range, query.resolvePrincipals, {
        from: query.from,
        to: query.to,
        actions: query.actions,
      });
    },
  );

  app.post("/api/cache/clear", async () => {
    await cache.clear();
    return { ok: true };
  });

  if (existsSync(webRoot)) {
    await app.register(fastifyStatic, { root: webRoot });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "Not found" });
      return reply.sendFile("index.html");
    });
  }

  return app;
}
