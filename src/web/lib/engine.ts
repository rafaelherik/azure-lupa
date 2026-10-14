// Loads snapshots into DuckDB and derives relations and orphan flags. Independent of how DuckDB
// was instantiated (browser worker or Node), so tests can run it against the real engine.

import { Float64, Int32, Table, Utf8, tableToIPC, vectorFromArray, type DataType, type Vector } from "apache-arrow";
import { armResourcePrefixes } from "../../shared/armid";
import { ORPHAN_RULES } from "../../shared/orphans";
import type { Snapshot } from "../../shared/types";
import { sqlString } from "./sql";

export interface SqlConn {
  query<T = Record<string, unknown>>(sql: string): Promise<T[]>;
  /**
   * Create table `name` from an Arrow IPC stream. Bytes rather than a Table object, because the
   * DuckDB bindings may hold their own copy of apache-arrow, whose classes would not match ours.
   */
  insert(name: string, ipc: Uint8Array): Promise<void>;
}

type Columns = Record<string, { type: DataType; values: unknown[] }>;

function arrowTable(cols: Columns): Table {
  const vectors: Record<string, Vector> = {};
  for (const [name, c] of Object.entries(cols)) vectors[name] = vectorFromArray(c.values, c.type);
  return new Table(vectors);
}

const str = () => ({ type: new Utf8(), values: [] as Array<string | null> });
const dbl = () => ({ type: new Float64(), values: [] as Array<number | null> });

const DDL: Record<string, string> = {
  resources: `id VARCHAR, id_lc VARCHAR, name VARCHAR, type VARCHAR, type_lc VARCHAR, kind VARCHAR,
    location VARCHAR, resource_group VARCHAR, subscription_id VARCHAR, tenant_id VARCHAR, sku VARCHAR,
    provisioning_state VARCHAR, managed_by VARCHAR, tags_json VARCHAR,
    f_attached VARCHAR, f_count DOUBLE, f_state VARCHAR, f_expires DOUBLE`,
  tags: "id_lc VARCHAR, key VARCHAR, key_lc VARCHAR, value VARCHAR, value_lc VARCHAR",
  refs: "src VARCHAR, ref VARCHAR, candidate VARCHAR, depth INTEGER",
  resource_groups: "id VARCHAR, name VARCHAR, location VARCHAR, subscription_id VARCHAR",
};

function columnsOf(snapshot: Snapshot): Record<keyof typeof DDL, Columns> {
  const res: Columns = {
    id: str(),
    id_lc: str(),
    name: str(),
    type: str(),
    type_lc: str(),
    kind: str(),
    location: str(),
    resource_group: str(),
    subscription_id: str(),
    tenant_id: str(),
    sku: str(),
    provisioning_state: str(),
    managed_by: str(),
    tags_json: str(),
    f_attached: str(),
    f_count: dbl(),
    f_state: str(),
    f_expires: dbl(),
  };
  const tags: Columns = { id_lc: str(), key: str(), key_lc: str(), value: str(), value_lc: str() };
  const refs: Columns = { src: str(), ref: str(), candidate: str(), depth: { type: new Int32(), values: [] } };
  const rgs: Columns = { id: str(), name: str(), location: str(), subscription_id: str() };
  const push = (cols: Columns, row: Record<string, unknown>) => {
    for (const [k, c] of Object.entries(cols)) c.values.push(row[k] ?? null);
  };

  for (const r of snapshot.resources) {
    const idLc = r.id.toLowerCase();
    push(res, {
      id: r.id,
      id_lc: idLc,
      name: r.name,
      type: r.type,
      type_lc: r.type.toLowerCase(),
      kind: r.kind,
      location: r.location,
      resource_group: r.resourceGroup,
      subscription_id: r.subscriptionId,
      tenant_id: r.tenantId,
      sku: r.sku,
      provisioning_state: r.provisioningState,
      managed_by: r.managedBy,
      tags_json: r.tags ? JSON.stringify(r.tags) : null,
      f_attached: r.facts?.attached,
      f_count: r.facts?.count,
      f_state: r.facts?.state,
      f_expires: r.facts?.expires,
    });
    for (const [key, value] of Object.entries(r.tags ?? {})) {
      const v = String(value ?? "");
      push(tags, { id_lc: idLc, key, key_lc: key.toLowerCase(), value: v, value_lc: v.toLowerCase() });
    }
    for (const ref of r.refs ?? []) {
      const prefixes = armResourcePrefixes(ref);
      (prefixes.length ? prefixes : [ref]).forEach((candidate, depth) =>
        push(refs, { src: idLc, ref, candidate, depth }),
      );
    }
  }
  for (const g of snapshot.resourceGroups) push(rgs, { ...g, subscription_id: g.subscriptionId });
  return { resources: res, tags, refs, resource_groups: rgs };
}

/** SQL that materializes `orphans(id_lc, rule_id)` from the rule registry. */
export function orphansSql(schema: string, now = Date.now()): string {
  const inbound = (fromType: string) =>
    `(SELECT count(*) FROM ${schema}.links l JOIN ${schema}.resources s ON s.id_lc = l.src
      WHERE l.dst = r.id_lc AND s.type_lc = ${sqlString(fromType)})`;
  const selects = ORPHAN_RULES.map(
    (rule) =>
      `SELECT r.id_lc, ${sqlString(rule.id)} AS rule_id FROM ${schema}.resources r
      WHERE r.type_lc = ${sqlString(rule.type)} AND (${rule.sql({ inbound, now })})`,
  );
  return `CREATE TABLE ${schema}.orphans AS\n${selects.join("\nUNION ALL\n")}`;
}

let seq = 0;

/**
 * Load a snapshot into a fresh schema and return its name. Queries carry the schema, so results
 * cached for a previous load keep pointing at consistent data until that schema is dropped.
 */
export async function loadSnapshot(conn: SqlConn, snapshot: Snapshot): Promise<string> {
  const schema = `s${++seq}`;
  await conn.query(`CREATE SCHEMA ${schema}`);
  const cols = columnsOf(snapshot);
  for (const [name, ddl] of Object.entries(DDL)) {
    await conn.query(`CREATE TABLE ${schema}.${name} (${ddl})`);
    const c = cols[name]!;
    if (!Object.values(c)[0]!.values.length) continue;
    const stage = `stage_${schema}_${name}`;
    await conn.insert(stage, tableToIPC(arrowTable(c), "stream"));
    await conn.query(`INSERT INTO ${schema}.${name} BY NAME SELECT * FROM ${stage}`);
    await conn.query(`DROP TABLE ${stage}`);
  }

  // A reference resolves to the most specific resource it points into (an ipConfiguration id
  // resolves to its NIC); references to nothing in the snapshot are kept as external.
  await conn.query(`CREATE TABLE ${schema}.links AS
    SELECT DISTINCT src, dst FROM (
      SELECT f.src, f.ref, r.id_lc AS dst
      FROM ${schema}.refs f JOIN ${schema}.resources r ON r.id_lc = f.candidate
      QUALIFY row_number() OVER (PARTITION BY f.src, f.ref ORDER BY f.depth) = 1
    ) WHERE src <> dst`);
  await conn.query(`CREATE TABLE ${schema}.external_refs AS
    SELECT DISTINCT f.src, f.ref FROM ${schema}.refs f
    WHERE f.depth = 0 AND f.ref LIKE '%/resourcegroups/%'
      AND NOT EXISTS (
        SELECT 1 FROM ${schema}.refs g JOIN ${schema}.resources r ON r.id_lc = g.candidate
        WHERE g.src = f.src AND g.ref = f.ref
      )`);
  await conn.query(orphansSql(schema));
  return schema;
}

export async function dropSnapshot(conn: SqlConn, schema: string) {
  await conn.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
}
