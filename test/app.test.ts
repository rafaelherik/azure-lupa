import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/server/app.js";
import { Cache } from "../src/server/cache.js";

let dir: string;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "lupa-app-"));
  app = await buildApp({ cache: new Cache({ dir }), token: "t", webRoot: join(dir, "none") });
});
afterAll(async () => {
  await app.close();
  await rm(dir, { recursive: true, force: true });
});

const snapshot = (payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/api/snapshot", headers: { host: "127.0.0.1", "x-lupa-token": "t" }, payload });

describe("POST /api/snapshot", () => {
  it.each([
    ["an empty body", {}],
    ["no subscriptions", { tenantId: "00000000-0000-0000-0000-000000000001", subscriptionIds: [] }],
    ["a non-GUID subscription", { tenantId: "00000000-0000-0000-0000-000000000001", subscriptionIds: ["x"] }],
    [
      "a string freshAfter",
      {
        tenantId: "00000000-0000-0000-0000-000000000001",
        subscriptionIds: ["00000000-0000-0000-0000-000000000002"],
        freshAfter: "soon",
      },
    ],
  ])("rejects %s with 400", async (_, body) => {
    const res = await snapshot(body);
    expect(res.statusCode).toBe(400);
  });
});
