import { expect, it } from "vitest";
import { parse, serialize } from "../src/web/lib/state.js";

it("restores action and custom date filters after switching vaults or following a shared link", () => {
  const first = parse(
    "?tenant=t&subs=one,two&id=vault-one&audit=1&range=custom&from=2026-11-01&to=2026-11-03&action=KeyCreate&action=SecretSet",
  );
  const second = parse(serialize({ ...first, selectedId: "vault-two" }));
  expect(second).toEqual({ ...first, selectedId: "vault-two" });
  expect(second.auditFilters).toEqual({
    range: "custom",
    from: "2026-11-01",
    to: "2026-11-03",
    actions: ["KeyCreate", "SecretSet"],
  });
  expect(parse(serialize({ ...second, vaultAudit: false })).auditFilters).toBeUndefined();
});
