import { describe, expect, it } from "vitest";
import { armParentId, armResourcePrefixes, extractArmRefs } from "../src/shared/armid.js";
import { ORPHAN_RULES, factsFor } from "../src/shared/orphans.js";
import { SNAPSHOT_VERSION, toSnapshotRow } from "../src/server/azure/snapshot.js";

const SUB = "00000000-0000-0000-0000-000000000001";
const base = `/subscriptions/${SUB}/resourceGroups/rg/providers`;

describe("armResourcePrefixes", () => {
  it("lists resource boundaries, longest first", () => {
    expect(armResourcePrefixes(`${base}/Microsoft.Network/networkInterfaces/nic/ipConfigurations/c`)).toEqual([
      `${base}/microsoft.network/networkinterfaces/nic/ipconfigurations/c`.toLowerCase(),
      `${base}/microsoft.network/networkinterfaces/nic`.toLowerCase(),
    ]);
  });

  it("handles extension resources and non-resource ids", () => {
    const ext = `${base}/Microsoft.Compute/virtualMachines/vm/providers/Microsoft.Insights/diagnosticSettings/d`;
    expect(armResourcePrefixes(ext)).toHaveLength(2);
    expect(armResourcePrefixes(`/subscriptions/${SUB}/resourceGroups/rg`)).toEqual([]);
    expect(armParentId(`${base}/Microsoft.Sql/servers/s/databases/d`)).toBe(
      `${base}/microsoft.sql/servers/s`.toLowerCase(),
    );
  });
});

describe("extractArmRefs", () => {
  it("finds distinct ids, skipping the resource and its own sub-resources", () => {
    const self = `${base}/Microsoft.Network/networkInterfaces/nic`;
    const vm = `${base}/Microsoft.Compute/virtualMachines/vm`;
    const refs = extractArmRefs(
      { ipConfigurations: [{ id: `${self}/ipConfigurations/c` }], virtualMachine: { id: vm }, other: [{ id: vm }] },
      self,
    );
    expect(refs).toEqual([vm.toLowerCase()]);
  });
});

describe("toSnapshotRow", () => {
  it("drops properties but keeps facts, refs and provisioning state", () => {
    const row = toSnapshotRow({
      id: `${base}/Microsoft.Compute/disks/d1`,
      name: "d1",
      type: "microsoft.compute/disks",
      location: "westeurope",
      resourceGroup: "rg",
      subscriptionId: SUB,
      tenantId: "t",
      tags: {},
      managedBy: "",
      properties: { diskState: "Unattached", provisioningState: "Succeeded", huge: "x".repeat(1000) },
    });
    expect(row).toEqual({
      id: `${base}/Microsoft.Compute/disks/d1`,
      name: "d1",
      type: "microsoft.compute/disks",
      kind: undefined,
      location: "westeurope",
      resourceGroup: "rg",
      subscriptionId: SUB,
      tenantId: "t",
      sku: undefined,
      tags: undefined,
      provisioningState: "Succeeded",
      managedBy: undefined,
      facts: { state: "Unattached" },
    });
  });
});

describe("orphan facts", () => {
  it.each([
    ["microsoft.network/publicipaddresses", { ipConfiguration: { id: "/x" } }, { attached: "/x" }],
    ["microsoft.network/publicipaddresses", {}, { attached: null }],
    ["microsoft.network/networkinterfaces", { hostedWorkloads: ["w"] }, { attached: "hostedWorkloads" }],
    ["microsoft.network/networksecuritygroups", { subnets: [{}], networkInterfaces: [{}] }, { count: 2 }],
    ["microsoft.web/serverfarms", { numberOfSites: 0 }, { count: 0 }],
    ["microsoft.web/serverfarms", {}, { count: null }],
    [
      "microsoft.network/applicationgateways",
      {
        backendAddressPools: [
          { properties: { backendAddresses: [] } },
          { properties: { backendIPConfigurations: [{}] } },
        ],
      },
      { count: 1 },
    ],
    [
      "microsoft.network/privateendpoints",
      {
        privateLinkServiceConnections: [
          { properties: { privateLinkServiceConnectionState: { status: "Disconnected" } } },
        ],
      },
      { state: "Disconnected" },
    ],
    ["microsoft.web/certificates", { expirationDate: "2020-01-01T00:00:00Z" }, { expires: Date.UTC(2020, 0, 1) }],
  ])("%s %j", (type, props, expected) => {
    expect(factsFor(type, props)).toEqual(expected);
  });

  it("returns nothing for types without facts", () => {
    expect(factsFor("microsoft.storage/storageaccounts", {})).toBeUndefined();
  });

  it("rules sharing a type never write the same fact", () => {
    const written = new Map<string, Set<string>>();
    for (const rule of ORPHAN_RULES.filter((r) => r.facts)) {
      const seen = written.get(rule.type) ?? new Set();
      for (const key of Object.keys(rule.facts!({}))) {
        expect(seen.has(key), `${rule.id} overwrites ${rule.type}.${key}`).toBe(false);
        seen.add(key);
      }
      written.set(rule.type, seen);
    }
  });
});

describe("SNAPSHOT_VERSION", () => {
  it("names every rule, so adding one invalidates cached snapshots", () => {
    for (const rule of ORPHAN_RULES) expect(SNAPSHOT_VERSION).toContain(`${rule.id}@${rule.type}`);
  });
});
