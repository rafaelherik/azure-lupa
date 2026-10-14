import { extractArmRefs } from "../../shared/armid.js";
import { ORPHAN_RULES, factsFor } from "../../shared/orphans.js";
import type { SnapshotRow } from "../../shared/types.js";

/**
 * Part of the snapshot cache key. Cached snapshots carry the facts extracted by the rules of the
 * version that built them; a rule added later would otherwise read missing facts as "detached" and
 * flag every resource of its type. Bump FORMAT when SnapshotRow or a facts extractor changes.
 */
const FORMAT = 1;
export const SNAPSHOT_VERSION = `${FORMAT}:${ORPHAN_RULES.map((r) => `${r.id}@${r.type}`)
  .sort()
  .join(",")}`;

/** Everything the browser engine needs for one scope; `properties` is reduced by `toSnapshotRow`. */
export function snapshotQuery(): string {
  return [
    "Resources",
    "| project id, name, type, kind, location, resourceGroup, subscriptionId, tenantId, sku = tostring(sku.name), tags, managedBy, properties",
    "| order by id asc",
  ].join("\n");
}

export interface RawSnapshotRow {
  id: string;
  name: string;
  type: string;
  kind?: string;
  location: string;
  resourceGroup: string;
  subscriptionId: string;
  tenantId: string;
  sku?: string;
  tags?: Record<string, string> | null;
  managedBy?: string | null;
  properties?: Record<string, unknown> | null;
}

/** Keep list fields, orphan-rule facts and referenced ids; drop the (often large) properties bag. */
export function toSnapshotRow(raw: RawSnapshotRow): SnapshotRow {
  const props = raw.properties ?? undefined;
  const provisioningState = typeof props?.provisioningState === "string" ? props.provisioningState : undefined;
  const facts = factsFor(raw.type, props);
  const refs = extractArmRefs(props, raw.id);
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    kind: raw.kind || undefined,
    location: raw.location,
    resourceGroup: raw.resourceGroup,
    subscriptionId: raw.subscriptionId,
    tenantId: raw.tenantId,
    sku: raw.sku || undefined,
    tags: raw.tags && Object.keys(raw.tags).length ? raw.tags : undefined,
    provisioningState,
    managedBy: raw.managedBy || undefined,
    ...(facts ? { facts } : {}),
    ...(refs.length ? { refs } : {}),
  };
}
