import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyError } from "fastify";
import fastifyStatic from "@fastify/static";
import type { ResourceQuery, ResourceRow, SummaryQuery } from "../shared/types.js";
import { AzureError } from "./azure/http.js";
import { Inventory } from "./azure/inventory.js";
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
    if (supplied !== token) return reply.code(401).send({ error: "Invalid session token. Reopen the URL printed by azure-lupa." });
  });

  app.setErrorHandler((err: FastifyError | AzureError, _req, reply) => {
    if (err instanceof AzureError) {
      return reply.code(err.status >= 400 && err.status < 600 ? err.status : 502).send({ error: err.message, code: err.code, hint: err.hint });
    }
    return reply.code(err.statusCode ?? 500).send({ error: err.message });
  });

  app.get<{ Querystring: { freshAfter?: string } }>("/api/tenants", (req) => inventory.tenants(freshAfter(req.query.freshAfter)));

  app.get<{ Params: { tid: string }; Querystring: { freshAfter?: string } }>("/api/tenants/:tid/subscriptions", (req) =>
    inventory.subscriptions(req.params.tid, freshAfter(req.query.freshAfter)),
  );

  app.get<{ Params: { tid: string; sid: string }; Querystring: { freshAfter?: string } }>(
    "/api/tenants/:tid/subscriptions/:sid/resource-groups",
    (req) => inventory.resourceGroups(req.params.tid, req.params.sid, freshAfter(req.query.freshAfter)),
  );

  app.post<{ Body: ResourceQuery }>("/api/resources/query", (req) => inventory.resources(req.body));

  app.post<{ Body: SummaryQuery }>("/api/summary", (req) => inventory.summary(req.body));

  app.get<{ Querystring: { tenantId: string; id: string; freshAfter?: string } }>("/api/resources/details", (req) =>
    inventory.details(req.query.tenantId, req.query.id, freshAfter(req.query.freshAfter)),
  );

  // GET with the query encoded in `q` so the browser can download natively via a link.
  app.get<{ Querystring: { q: string; format?: string } }>("/api/export", async (req, reply) => {
    const query = JSON.parse(Buffer.from(req.query.q, "base64url").toString("utf8")) as ResourceQuery;
    const format = req.query.format === "json" ? "json" : "csv";
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    reply
      .header("content-type", format === "json" ? "application/json" : "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="azure-inventory-${stamp}.${format}"`);
    return reply.send(Readable.from(format === "json" ? exportJson(inventory.exportRows(query)) : exportCsv(inventory.exportRows(query))));
  });

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

const CSV_COLUMNS: Array<keyof ResourceRow> = [
  "name",
  "type",
  "kind",
  "resourceGroup",
  "location",
  "subscriptionId",
  "tenantId",
  "sku",
  "provisioningState",
  "tags",
  "id",
];

export function csvCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  const s =
    typeof value === "object"
      ? Object.entries(value as Record<string, unknown>)
          .map(([k, v]) => `${k}=${String(v)}`)
          .join("; ")
      : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function* exportCsv(pages: AsyncGenerator<ResourceRow[]>) {
  yield CSV_COLUMNS.join(",") + "\n";
  for await (const rows of pages) {
    yield rows.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c])).join(",")).join("\n") + (rows.length ? "\n" : "");
  }
}

async function* exportJson(pages: AsyncGenerator<ResourceRow[]>) {
  yield "[";
  let first = true;
  for await (const rows of pages) {
    for (const row of rows) {
      yield (first ? "\n" : ",\n") + JSON.stringify(row);
      first = false;
    }
  }
  yield "\n]\n";
}
