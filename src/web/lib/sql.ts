// SQL for the in-browser DuckDB engine. Every query is scoped to one snapshot schema, so switching
// between scopes never mixes data. Table and column layout is created in engine.ts.

import type { ResourceFilters, SortField } from "../../shared/types";

/** Quote a value as a SQL string literal. */
export function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** A case-insensitive "contains" pattern for `ILIKE … ESCAPE '\'`. */
export function likePattern(value: string): string {
  return sqlString(`%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
}

const lowerList = (values: string[]) => `(${values.map((v) => sqlString(v.toLowerCase())).join(", ")})`;

/** Conditions (ANDed) over `resources r` for the given filters; mirrors the old KQL semantics. */
export function whereSql(schema: string, filters: ResourceFilters = {}, omit: Array<keyof ResourceFilters> = []) {
  const out: string[] = [];
  const on = (k: keyof ResourceFilters) => !omit.includes(k);

  const search = filters.search?.trim();
  if (search && on("search")) {
    const p = likePattern(search);
    out.push(
      `(r.name ILIKE ${p} ESCAPE '\\' OR r.type ILIKE ${p} ESCAPE '\\' OR r.resource_group ILIKE ${p} ESCAPE '\\')`,
    );
  }
  if (filters.types?.length && on("types")) out.push(`r.type_lc IN ${lowerList(filters.types)}`);
  if (filters.locations?.length && on("locations")) out.push(`lower(r.location) IN ${lowerList(filters.locations)}`);
  if (filters.resourceGroups?.length && on("resourceGroups")) {
    out.push(`lower(r.resource_group) IN ${lowerList(filters.resourceGroups)}`);
  }
  for (const tag of (on("tags") && filters.tags) || []) {
    const eq = tag.indexOf("=");
    const key = (eq === -1 ? tag : tag.slice(0, eq)).trim().toLowerCase();
    const value =
      eq === -1
        ? undefined
        : tag
            .slice(eq + 1)
            .trim()
            .toLowerCase();
    out.push(
      `EXISTS (SELECT 1 FROM ${schema}.tags t WHERE t.id_lc = r.id_lc AND t.key_lc = ${sqlString(key)}` +
        (value === undefined ? " AND t.value <> '')" : ` AND t.value_lc = ${sqlString(value)})`),
    );
  }
  if (filters.orphansOnly && on("orphansOnly")) out.push(`r.id_lc IN (SELECT id_lc FROM ${schema}.orphans)`);
  return out.length ? `WHERE ${out.join("\n  AND ")}` : "";
}

const SORT_COLUMN: Record<SortField, string> = {
  name: "r.name",
  type: "r.type_lc",
  location: "r.location",
  resourceGroup: "r.resource_group",
  subscriptionId: "r.subscription_id",
};

export function orderSql(sort?: { field: SortField; dir: "asc" | "desc" }) {
  const col = SORT_COLUMN[sort?.field ?? "name"] ?? "r.name";
  // secondary sort on id keeps paging stable
  return `ORDER BY lower(${col}) ${sort?.dir === "desc" ? "DESC" : "ASC"}, r.id_lc`;
}

/** The columns of a table row, shaped like ResourceRow (tags and orphan rules decoded in JS). */
export function rowColumns(schema: string) {
  return `r.id, r.name, r.type, r.kind, r.location, r.resource_group AS "resourceGroup",
  r.subscription_id AS "subscriptionId", r.tenant_id AS "tenantId", r.sku,
  r.provisioning_state AS "provisioningState", r.tags_json AS "tagsJson",
  (SELECT string_agg(o.rule_id, ',') FROM ${schema}.orphans o WHERE o.id_lc = r.id_lc) AS "orphanRules"`;
}

export function rowsSql(
  schema: string,
  filters: ResourceFilters,
  sort?: { field: SortField; dir: "asc" | "desc" },
  page?: { offset: number; limit: number },
) {
  return [
    `SELECT ${rowColumns(schema)}`,
    `FROM ${schema}.resources r`,
    whereSql(schema, filters),
    orderSql(sort),
    page ? `LIMIT ${Math.trunc(page.limit)} OFFSET ${Math.trunc(page.offset)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function countSql(schema: string, filters: ResourceFilters) {
  return `SELECT count(*) AS n FROM ${schema}.resources r ${whereSql(schema, filters)}`;
}

const GROUP_COLUMN = {
  type: "r.type_lc",
  location: "r.location",
  subscriptionId: "r.subscription_id",
  resourceGroup: "r.resource_group",
} as const;

export function groupCountSql(schema: string, column: keyof typeof GROUP_COLUMN, filters?: ResourceFilters) {
  return [
    `SELECT ${GROUP_COLUMN[column]} AS key, count(*) AS count`,
    `FROM ${schema}.resources r`,
    whereSql(schema, filters),
    "GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 1000",
  ]
    .filter(Boolean)
    .join("\n");
}

export function orphanCountsSql(schema: string, filters?: ResourceFilters) {
  return [
    "SELECT o.rule_id AS key, count(*) AS count",
    `FROM ${schema}.orphans o JOIN ${schema}.resources r ON r.id_lc = o.id_lc`,
    whereSql(schema, filters),
    "GROUP BY 1 ORDER BY 2 DESC, 1",
  ]
    .filter(Boolean)
    .join("\n");
}

export function emptyResourceGroupsSql(schema: string) {
  return `SELECT g.id, g.name, g.subscription_id AS "subscriptionId", g.location
FROM ${schema}.resource_groups g
WHERE NOT EXISTS (
  SELECT 1 FROM ${schema}.resources r
  WHERE lower(r.subscription_id) = lower(g.subscription_id) AND lower(r.resource_group) = lower(g.name)
)
ORDER BY lower(g.name)`;
}

/**
 * Everything related to one resource, as (relation, id, name, type) rows. Ids not in the snapshot
 * (another subscription, or out of scope) come back with relation 'external' and no name.
 */
export function relatedSql(schema: string, id: string) {
  const self = sqlString(id.toLowerCase());
  const cols = "r.id, r.name, r.type";
  return `SELECT * FROM (
  SELECT 'parent' AS relation, * FROM (
    SELECT ${cols} FROM ${schema}.resources r
    WHERE starts_with(${self}, r.id_lc || '/')
    ORDER BY length(r.id_lc) DESC LIMIT 1
  )
  UNION ALL
  SELECT 'child', ${cols} FROM ${schema}.resources r
    WHERE starts_with(r.id_lc, ${self} || '/')
  UNION ALL
  SELECT 'uses', ${cols} FROM ${schema}.links l JOIN ${schema}.resources r ON r.id_lc = l.dst
    WHERE l.src = ${self}
  UNION ALL
  SELECT 'usedBy', ${cols} FROM ${schema}.links l JOIN ${schema}.resources r ON r.id_lc = l.src
    WHERE l.dst = ${self}
  UNION ALL
  SELECT 'external', e.ref, NULL, NULL FROM ${schema}.external_refs e
    WHERE e.src = ${self}
)
ORDER BY relation, lower(type), lower(name), id
LIMIT 500`;
}

/** Rule ids flagging one resource. */
export function orphanRulesForSql(schema: string, id: string) {
  return `SELECT rule_id AS "ruleId" FROM ${schema}.orphans WHERE id_lc = ${sqlString(id.toLowerCase())} ORDER BY 1`;
}

/** Which of the given ids exist in the snapshot (for linking ids inside the property tree). */
export function knownIdsSql(schema: string, ids: string[]) {
  if (!ids.length) return undefined;
  return `SELECT id FROM ${schema}.resources WHERE id_lc IN ${lowerList(ids)}`;
}
