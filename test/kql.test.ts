import { describe, expect, it } from "vitest";
import { kqlString } from "../src/server/azure/kql.js";
import { parseResourceId } from "../src/server/azure/inventory.js";

describe("kqlString", () => {
  it("escapes quotes, backslashes and newlines", () => {
    expect(kqlString('a"b\\c\nd')).toBe('"a\\"b\\\\c d"');
  });
});

describe("parseResourceId", () => {
  it("handles top-level and nested resources", () => {
    expect(parseResourceId("/subscriptions/s/resourceGroups/rg/providers/Microsoft.Web/sites/app")).toEqual({
      subscriptionId: "s",
      namespace: "Microsoft.Web",
      resourceType: "sites",
    });
    expect(
      parseResourceId("/subscriptions/s/resourceGroups/rg/providers/Microsoft.Sql/servers/srv/databases/db"),
    ).toEqual({ subscriptionId: "s", namespace: "Microsoft.Sql", resourceType: "servers/databases" });
  });
});
