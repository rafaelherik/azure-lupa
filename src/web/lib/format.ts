export function timeAgo(epochMs: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - epochMs) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** "microsoft.compute/virtualmachines" → "virtualmachines"; nested types keep their last segment. */
export function shortType(type: string): string {
  return type.split("/").pop() ?? type;
}

/** "microsoft.compute/galleries/images" → "galleries/images" (the provider namespace dropped). */
export function typeWithinProvider(type: string): string {
  return type.split("/").slice(1).join("/") || type;
}

export function providerOf(type: string): string {
  return type.split("/")[0] ?? type;
}

export function portalUrl(resourceId: string, tenantId?: string): string {
  return `https://portal.azure.com/#${tenantId ? `@${tenantId}` : ""}/resource${resourceId}`;
}

export const nf = new Intl.NumberFormat();
