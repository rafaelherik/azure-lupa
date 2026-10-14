import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { createDuckDB, NODE_RUNTIME, VoidLogger } from "@duckdb/duckdb-wasm/blocking";
import type { Snapshot, SnapshotRow } from "../src/shared/types.js";
import { toSnapshotRow, type RawSnapshotRow } from "../src/server/azure/snapshot.js";
import { loadSnapshot, type SqlConn } from "../src/web/lib/engine.js";
import { countSql, emptyResourceGroupsSql, orphanCountsSql, relatedSql, rowsSql } from "../src/web/lib/sql.js";

const require = createRequire(import.meta.url);
const SUB = "00000000-0000-0000-0000-000000000001";
const rg = (name: string) => `/subscriptions/${SUB}/resourceGroups/${name}`;
const id = (rgName: string, type: string, name: string) => `${rg(rgName)}/providers/${type}/${name}`;

function raw(
  type: string,
  name: string,
  properties: Record<string, unknown> = {},
  extra: Partial<RawSnapshotRow> = {},
) {
  return toSnapshotRow({
    id: id("rg-app", type, name),
    name,
    type: type.toLowerCase(),
    location: "westeurope",
    resourceGroup: "rg-app",
    subscriptionId: SUB,
    tenantId: "t",
    properties,
    ...extra,
  });
}

const vm = id("rg-app", "Microsoft.Compute/virtualMachines", "vm1");
const nicAttached = id("rg-app", "Microsoft.Network/networkInterfaces", "nic1");
const nsg = id("rg-app", "Microsoft.Network/networkSecurityGroups", "nsg-used");
const gw = id("rg-app", "Microsoft.Network/virtualNetworkGateways", "gw-used");
const sqlServer = id("rg-app", "Microsoft.Sql/servers", "sql1");

const resources: SnapshotRow[] = [
  raw(
    "Microsoft.Compute/virtualMachines",
    "vm1",
    {
      networkProfile: { networkInterfaces: [{ id: nicAttached }] },
    },
    { tags: { env: "Prod" } },
  ),
  raw("Microsoft.Network/networkInterfaces", "nic1", {
    virtualMachine: { id: vm },
    networkSecurityGroup: { id: nsg },
    ipConfigurations: [{ id: `${nicAttached}/ipConfigurations/ipconfig1` }],
  }),
  raw("Microsoft.Network/networkInterfaces", "nic-orphan", {}),
  raw("Microsoft.Network/networkSecurityGroups", "nsg-used", { networkInterfaces: [{ id: nicAttached }] }),
  raw("Microsoft.Network/networkSecurityGroups", "nsg-orphan", { networkInterfaces: [], subnets: [] }),
  raw("Microsoft.Compute/disks", "disk-orphan", { diskState: "Unattached" }),
  raw("Microsoft.Compute/disks", "disk-asrreplica", { diskState: "Unattached" }),
  raw("Microsoft.Compute/disks", "disk-used", { diskState: "Attached" }, { managedBy: vm }),
  raw("Microsoft.Network/publicIPAddresses", "pip_orphan", {}),
  raw("Microsoft.Network/virtualNetworkGateways", "gw-used", {}),
  raw("Microsoft.Network/virtualNetworkGateways", "gw-orphan", {}),
  raw("Microsoft.Network/connections", "conn1", { virtualNetworkGateway1: { id: gw } }),
  raw("Microsoft.Web/certificates", "cert-old", { expirationDate: "2020-01-01T00:00:00Z" }),
  raw("Microsoft.Sql/servers", "sql1", {}),
  raw("Microsoft.Sql/servers/elasticPools", "sql1/pool-empty", {}, { id: `${sqlServer}/elasticPools/pool-empty` }),
  raw("Microsoft.Sql/servers/elasticPools", "sql1/pool-used", {}, { id: `${sqlServer}/elasticPools/pool-used` }),
  raw(
    "Microsoft.Sql/servers/databases",
    "sql1/db1",
    { elasticPoolId: `${sqlServer}/elasticPools/pool-used` },
    {
      id: `${sqlServer}/databases/db1`,
    },
  ),
  raw("Microsoft.Web/connections", "office365", {}),
];

const snapshot: Snapshot = {
  resources,
  resourceGroups: [
    { id: rg("rg-app"), name: "rg-app", location: "westeurope", subscriptionId: SUB },
    { id: rg("rg-empty"), name: "rg-empty", location: "westeurope", subscriptionId: SUB },
  ],
};

let conn: SqlConn;
let schema: string;

beforeAll(async () => {
  const dist = (f: string) => require.resolve(`@duckdb/duckdb-wasm/dist/${f}`);
  const db = await createDuckDB(
    {
      mvp: { mainModule: dist("duckdb-mvp.wasm"), mainWorker: "" },
      eh: { mainModule: dist("duckdb-eh.wasm"), mainWorker: "" },
    },
    new VoidLogger(),
    NODE_RUNTIME,
  );
  await db.instantiate();
  db.open({ query: { castBigIntToDouble: true } });
  const c = db.connect();
  conn = {
    query: async (sql) =>
      c
        .query(sql)
        .toArray()
        .map((r) => r.toJSON()) as never,
    insert: async (name, ipc) => c.insertArrowFromIPCStream(ipc, { name }),
  };
  schema = await loadSnapshot(conn, snapshot);
}, 60_000);

const orphanNames = async () =>
  (await conn.query<{ name: string; orphanRules: string }>(rowsSql(schema, { orphansOnly: true })))
    .map((r) => `${r.name}:${r.orphanRules}`)
    .sort();

describe("engine", () => {
  it("flags orphans by rule", async () => {
    expect(await orphanNames()).toEqual([
      "cert-old:cert-expired",
      "disk-orphan:disk-unattached",
      "gw-orphan:vng-no-connections",
      "nic-orphan:nic-unattached",
      "nsg-orphan:nsg-unassociated",
      "office365:apiconn-unused",
      "pip_orphan:pip-unassociated",
      "sql1/pool-empty:sqlpool-empty",
    ]);
  });

  it("counts orphans by rule and finds empty resource groups", async () => {
    const counts = await conn.query<{ key: string; count: number }>(orphanCountsSql(schema));
    expect(counts.reduce((n, c) => n + c.count, 0)).toBe(8);
    expect(await conn.query(emptyResourceGroupsSql(schema))).toEqual([
      { id: rg("rg-empty"), name: "rg-empty", subscriptionId: SUB, location: "westeurope" },
    ]);
  });

  it("filters with escaped search and tags", async () => {
    const n = async (f: Parameters<typeof countSql>[1]) => (await conn.query<{ n: number }>(countSql(schema, f)))[0]!.n;
    expect(await n({ search: "pip_" })).toBe(1);
    expect(await n({ search: "PIP%" })).toBe(0);
    expect(await n({ tags: ["env=prod"] })).toBe(1);
    expect(await n({ tags: ["env"] })).toBe(1);
    expect(await n({ types: ["Microsoft.Compute/disks"], orphansOnly: true })).toBe(1);
  });

  it("resolves relations, including sub-resource references and parents", async () => {
    const rel = async (rid: string) =>
      (await conn.query<{ relation: string; name: string }>(relatedSql(schema, rid))).map(
        (r) => `${r.relation}:${r.name}`,
      );
    expect(await rel(nicAttached)).toEqual(["usedBy:vm1", "usedBy:nsg-used", "uses:vm1", "uses:nsg-used"]);
    expect(await rel(`${sqlServer}/databases/db1`)).toEqual(["parent:sql1", "uses:sql1/pool-used"]);
    expect(await rel(sqlServer)).toEqual(["child:sql1/db1", "child:sql1/pool-empty", "child:sql1/pool-used"]);
  });
});
