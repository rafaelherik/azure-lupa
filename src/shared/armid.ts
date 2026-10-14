// ARM id helpers shared by the server (reference extraction) and the web engine (relations).

/**
 * Lowercased resource ids that `id` belongs to, longest first: every point where a provider
 * type/name pair ends. "…/networkInterfaces/nic/ipConfigurations/c" yields the ipConfiguration
 * id and the NIC id, so a reference to a sub-resource can be matched to the resource that owns it.
 */
export function armResourcePrefixes(id: string): string[] {
  const parts = id.toLowerCase().split("/").filter(Boolean);
  const first = parts.indexOf("providers");
  if (parts[0] !== "subscriptions" || first === -1) return [];
  const out: string[] = [];
  let i = first + 2; // past "providers/{namespace}"
  while (i + 1 < parts.length) {
    if (parts[i] === "providers") {
      i += 2;
      continue;
    }
    i += 2; // one type/name pair
    out.push("/" + parts.slice(0, i).join("/"));
  }
  return out.reverse();
}

/** The parent resource of a nested resource ("…/servers/s/databases/d" → "…/servers/s"), lowercased. */
export function armParentId(id: string): string | undefined {
  return armResourcePrefixes(id)[1];
}

const ARM_ID = /\/subscriptions\/[0-9a-f-]{36}\/[^"\s\\?#]+/gi;

/**
 * Distinct, lowercased ARM ids mentioned anywhere in `value`, excluding the resource itself and
 * its own sub-resources (a NIC lists its ipConfigurations, which is not a relation).
 */
export function extractArmRefs(value: unknown, selfId: string): string[] {
  if (value === undefined || value === null) return [];
  const self = selfId.toLowerCase();
  const found = new Set<string>();
  for (const m of JSON.stringify(value).matchAll(ARM_ID)) {
    const ref = m[0].toLowerCase().replace(/\/+$/, "");
    if (ref === self || ref.startsWith(self + "/")) continue;
    found.add(ref);
  }
  return [...found];
}
