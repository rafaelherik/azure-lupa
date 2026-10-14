import { describe, expect, it } from "vitest";
import { kqlString, resourcesQuery, whereClauses } from "../src/server/azure/kql.js";
import { parseResourceId } from "../src/server/azure/inventory.js";

describe("kqlString", () => {
  it("escapes quotes, backslashes and newlines", () => {
    expect(kqlString('a"b\\c\nd')).toBe('"a\\"b\\\\c d"');
  });
});

describe("whereClauses", () => {
  it("builds clauses for each filter", () => {
    const clauses = whereClauses({
      search: "web",
      types: ["microsoft.web/sites"],
      locations: ["eastus2", "westeurope"],
      resourceGroups: ["rg-1"],
      tags: ["env=prod", "owner"],
    });
    expect(clauses).toEqual([
      '| where name contains "web" or type contains "web" or resourceGroup contains "web"',
      '| where type in~ ("microsoft.web/sites")',
      '| where location in~ ("eastus2", "westeurope")',
      '| where resourceGroup in~ ("rg-1")',
      '| where tostring(tags["env"]) =~ "prod" and isnotempty(tostring(tags["owner"]))',
    ]);
  });

  it("cannot be broken out of with injected quotes", () => {
    const [clause] = whereClauses({ search: '" | take 1 //' });
    expect(clause).toContain('"\\" | take 1 //"');
  });

  it("skips empty and omitted filters", () => {
    expect(whereClauses({ search: "  ", types: [] })).toEqual([]);
    expect(whereClauses({ types: ["x"] }, ["types"])).toEqual([]);
  });
});

describe("resourcesQuery", () => {
  it("orders by the sort field with a stable tiebreaker", () => {
    expect(resourcesQuery({}, { field: "location", dir: "desc" })).toMatch(/order by location desc, id asc$/);
  });
});

describe("parseResourceId", () => {
  it("handles nested resource types", () => {
    expect(
      parseResourceId("/subscriptions/s1/resourceGroups/rg/providers/Microsoft.Sql/servers/srv/databases/db"),
    ).toEqual({ subscriptionId: "s1", namespace: "Microsoft.Sql", resourceType: "servers/databases" });
  });
});
