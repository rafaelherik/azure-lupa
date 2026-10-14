import { describe, expect, it } from "vitest";
import { likePattern, orderSql, sqlString, whereSql } from "../src/web/lib/sql.js";

describe("sqlString / likePattern", () => {
  it("escapes quotes and LIKE wildcards", () => {
    expect(sqlString("o'brien")).toBe("'o''brien'");
    expect(likePattern("50%_a\\b")).toBe("'%50\\%\\_a\\\\b%'");
  });
});

describe("whereSql", () => {
  it("builds one condition per filter, case-insensitively", () => {
    const sql = whereSql("s1", {
      search: "web",
      types: ["Microsoft.Web/sites"],
      locations: ["EastUS2"],
      resourceGroups: ["RG-1"],
      tags: ["Env=Prod", "owner"],
      orphansOnly: true,
    });
    expect(sql).toContain("r.name ILIKE '%web%' ESCAPE '\\'");
    expect(sql).toContain("r.type_lc IN ('microsoft.web/sites')");
    expect(sql).toContain("lower(r.location) IN ('eastus2')");
    expect(sql).toContain("lower(r.resource_group) IN ('rg-1')");
    expect(sql).toContain("t.key_lc = 'env' AND t.value_lc = 'prod'");
    expect(sql).toContain("t.key_lc = 'owner' AND t.value <> ''");
    expect(sql).toContain("r.id_lc IN (SELECT id_lc FROM s1.orphans)");
  });

  it("skips empty and omitted filters", () => {
    expect(whereSql("s1", { search: "  ", types: [] })).toBe("");
    expect(whereSql("s1", { types: ["x"], orphansOnly: true }, ["types", "orphansOnly"])).toBe("");
  });
});

describe("orderSql", () => {
  it("orders by the sort field with a stable tiebreaker", () => {
    expect(orderSql({ field: "location", dir: "desc" })).toBe("ORDER BY lower(r.location) DESC, r.id_lc");
    expect(orderSql()).toBe("ORDER BY lower(r.name) ASC, r.id_lc");
  });
});
