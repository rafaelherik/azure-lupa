import type { ResourceFilters, SortField } from "../../shared/types.js";

/** Quote a value as a KQL string literal. */
export function kqlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ")}"`;
}

function kqlList(values: string[]): string {
  return `(${values.map(kqlString).join(", ")})`;
}

/** Where-clauses for the given filters; each entry is a complete `| where ...` line. */
export function whereClauses(filters: ResourceFilters = {}, omit: Array<keyof ResourceFilters> = []): string[] {
  const out: string[] = [];
  const use = (k: keyof ResourceFilters) => !omit.includes(k);

  const search = filters.search?.trim();
  if (search && use("search")) {
    out.push(
      `| where name contains ${kqlString(search)} or type contains ${kqlString(search)} or resourceGroup contains ${kqlString(search)}`,
    );
  }
  if (filters.types?.length && use("types")) out.push(`| where type in~ ${kqlList(filters.types)}`);
  if (filters.locations?.length && use("locations")) out.push(`| where location in~ ${kqlList(filters.locations)}`);
  if (filters.resourceGroups?.length && use("resourceGroups")) {
    out.push(`| where resourceGroup in~ ${kqlList(filters.resourceGroups)}`);
  }
  if (filters.tags?.length && use("tags")) {
    const parts = filters.tags.map((tag) => {
      const eq = tag.indexOf("=");
      if (eq === -1) return `isnotempty(tostring(tags[${kqlString(tag.trim())}]))`;
      const key = tag.slice(0, eq).trim();
      const value = tag.slice(eq + 1).trim();
      return `tostring(tags[${kqlString(key)}]) =~ ${kqlString(value)}`;
    });
    out.push(`| where ${parts.join(" and ")}`);
  }
  return out;
}

const SORTABLE: Record<SortField, string> = {
  name: "name",
  type: "type",
  location: "location",
  resourceGroup: "resourceGroup",
  subscriptionId: "subscriptionId",
};

export function resourcesQuery(
  filters: ResourceFilters | undefined,
  sort?: { field: SortField; dir: "asc" | "desc" },
): string {
  const field = SORTABLE[sort?.field ?? "name"] ?? "name";
  const dir = sort?.dir === "desc" ? "desc" : "asc";
  return [
    "Resources",
    ...whereClauses(filters),
    "| project id, name, type, kind, location, resourceGroup, subscriptionId, tenantId, sku = tostring(sku.name), tags, provisioningState = tostring(properties.provisioningState)",
    // secondary sort on id keeps paging stable
    `| order by ${field} ${dir}, id asc`,
  ].join("\n");
}

export function countByQuery(
  column: "type" | "location" | "subscriptionId" | "resourceGroup",
  filters?: ResourceFilters,
): string {
  return [
    "Resources",
    ...whereClauses(filters),
    `| summarize count = count() by key = ${column}`,
    "| order by ['count'] desc",
    "| take 1000",
  ].join("\n");
}

export function resourceGroupsQuery(): string {
  return [
    "ResourceContainers",
    "| where type =~ 'microsoft.resources/subscriptions/resourcegroups'",
    "| project id, name, location, subscriptionId",
    "| order by name asc",
  ].join("\n");
}

export function resourceGroupCountsQuery(): string {
  return "Resources | summarize count = count() by resourceGroup = tolower(resourceGroup)";
}
