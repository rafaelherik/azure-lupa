import type {
  Cached,
  CountBucket,
  ResourceDetails,
  ResourceGroup,
  ResourcePage,
  ResourceQuery,
  ResourceRow,
  Subscription,
  Summary,
  SummaryQuery,
  Tenant,
} from "../../shared/types.js";
import { Cache } from "../cache.js";
import { AzureError, armFetch } from "./http.js";
import { countByQuery, resourceGroupCountsQuery, resourceGroupsQuery, resourcesQuery } from "./kql.js";

const PAGE_SIZE = 500;
const DAY = 24 * 60 * 60_000;

interface ArmList<T> {
  value: T[];
  nextLink?: string;
}

interface GraphResponse<T> {
  totalRecords: number;
  count: number;
  data: T[];
  $skipToken?: string;
}

async function armListAll<T>(tenantId: string | undefined, path: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = path;
  while (next) {
    const page: ArmList<T> = await armFetch<ArmList<T>>({ tenantId, path: next });
    out.push(...page.value);
    next = page.nextLink;
  }
  return out;
}

export class Inventory {
  constructor(private cache: Cache) {}

  private graph<T>(
    tenantId: string,
    subscriptions: string[],
    query: string,
    opts: { top?: number; skipToken?: string } = {},
  ) {
    if (subscriptions.length === 0) throw new AzureError("Select at least one subscription", 400, "NoScope");
    return armFetch<GraphResponse<T>>({
      tenantId,
      method: "POST",
      path: "/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01",
      body: {
        subscriptions,
        query,
        options: { $top: opts.top ?? PAGE_SIZE, $skipToken: opts.skipToken, resultFormat: "objectArray" },
      },
    });
  }

  /** All pages of a Resource Graph query (used for small result sets and exports). */
  private async *graphAll<T>(tenantId: string, subscriptions: string[], query: string): AsyncGenerator<T[]> {
    let skipToken: string | undefined;
    do {
      const page: GraphResponse<T> = await this.graph<T>(tenantId, subscriptions, query, { top: 1000, skipToken });
      yield page.data;
      skipToken = page.$skipToken;
    } while (skipToken);
  }

  private async graphCollect<T>(tenantId: string, subscriptions: string[], query: string): Promise<T[]> {
    const out: T[] = [];
    for await (const rows of this.graphAll<T>(tenantId, subscriptions, query)) out.push(...rows);
    return out;
  }

  tenants(freshAfter?: number): Promise<Cached<Tenant[]>> {
    return this.cache.wrap(
      "tenants",
      async () => {
        const raw = await armListAll<{ tenantId: string; displayName?: string; defaultDomain?: string }>(
          undefined,
          "/tenants?api-version=2022-12-01",
        );
        return raw
          .map((t): Tenant => ({
            tenantId: t.tenantId,
            displayName: t.displayName || t.defaultDomain || t.tenantId,
            defaultDomain: t.defaultDomain,
            status: "ok",
          }))
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
      },
      { freshAfter, ttlMs: DAY },
    );
  }

  subscriptions(tenantId: string, freshAfter?: number): Promise<Cached<Subscription[]>> {
    return this.cache.wrap(
      Cache.key("subs", tenantId),
      async () => {
        const raw = await armListAll<{ subscriptionId: string; tenantId: string; displayName: string; state: string }>(
          tenantId,
          "/subscriptions?api-version=2022-12-01",
        );
        return (
          raw
            // the token for a tenant can still list subscriptions homed elsewhere (e.g. Lighthouse)
            .filter((s) => !s.tenantId || s.tenantId === tenantId)
            .map((s) => ({ subscriptionId: s.subscriptionId, tenantId, displayName: s.displayName, state: s.state }))
            .sort((a, b) => a.displayName.localeCompare(b.displayName))
        );
      },
      { freshAfter, ttlMs: 60 * 60_000 },
    );
  }

  resourceGroups(tenantId: string, subscriptionId: string, freshAfter?: number): Promise<Cached<ResourceGroup[]>> {
    return this.cache.wrap(
      Cache.key("rgs", [tenantId, subscriptionId]),
      async () => {
        const [groups, counts] = await Promise.all([
          this.graphCollect<ResourceGroup>(tenantId, [subscriptionId], resourceGroupsQuery()),
          this.graphCollect<{ resourceGroup: string; count: number }>(
            tenantId,
            [subscriptionId],
            resourceGroupCountsQuery(),
          ),
        ]);
        const byName = new Map(counts.map((c) => [c.resourceGroup, c.count]));
        return groups.map((g) => ({ ...g, resourceCount: byName.get(g.name.toLowerCase()) ?? 0 }));
      },
      { freshAfter },
    );
  }

  resources(q: ResourceQuery): Promise<Cached<ResourcePage>> {
    const subs = [...q.subscriptionIds].sort();
    const query = resourcesQuery(q.filters, q.sort);
    return this.cache.wrap(
      Cache.key("res", [q.tenantId, subs, query, q.skipToken ?? null]),
      async () => {
        const page = await this.graph<ResourceRow>(q.tenantId, subs, query, { skipToken: q.skipToken });
        return { rows: page.data, skipToken: page.$skipToken, totalRecords: page.totalRecords };
      },
      { freshAfter: q.freshAfter },
    );
  }

  async *exportRows(q: ResourceQuery): AsyncGenerator<ResourceRow[]> {
    yield* this.graphAll<ResourceRow>(q.tenantId, q.subscriptionIds, resourcesQuery(q.filters, q.sort));
  }

  summary(q: SummaryQuery): Promise<Cached<Summary>> {
    const subs = [...q.subscriptionIds].sort();
    return this.cache.wrap(
      Cache.key("sum", [q.tenantId, subs, q.filters ?? {}]),
      async () => {
        const count = (col: Parameters<typeof countByQuery>[0]) =>
          this.graphCollect<CountBucket>(q.tenantId, subs, countByQuery(col, q.filters));
        const [byType, byLocation, bySubscription, byResourceGroup] = await Promise.all([
          count("type"),
          count("location"),
          count("subscriptionId"),
          count("resourceGroup"),
        ]);
        const total = byType.reduce((n, b) => n + b.count, 0);
        return { total, byType, byLocation, bySubscription, byResourceGroup };
      },
      { freshAfter: q.freshAfter },
    );
  }

  private async apiVersionFor(
    tenantId: string,
    subscriptionId: string,
    namespace: string,
    resourceType: string,
  ): Promise<string> {
    const provider = await this.cache.wrap(
      Cache.key("provider", [tenantId, subscriptionId, namespace.toLowerCase()]),
      () =>
        armFetch<{ resourceTypes: Array<{ resourceType: string; apiVersions: string[] }> }>({
          tenantId,
          path: `/subscriptions/${subscriptionId}/providers/${namespace}?api-version=2021-04-01`,
        }),
      { ttlMs: 7 * DAY },
    );
    const match = provider.data.resourceTypes.find((t) => t.resourceType.toLowerCase() === resourceType.toLowerCase());
    const versions = match?.apiVersions ?? [];
    const version = versions.find((v) => !v.includes("preview")) ?? versions[0];
    if (!version) throw new AzureError(`No API version known for ${namespace}/${resourceType}`, 404, "NoApiVersion");
    return version;
  }

  details(tenantId: string, resourceId: string, freshAfter?: number): Promise<Cached<ResourceDetails>> {
    return this.cache.wrap(
      Cache.key("detail", [tenantId, resourceId.toLowerCase()]),
      async () => {
        const parsed = parseResourceId(resourceId);
        const apiVersion = await this.apiVersionFor(
          tenantId,
          parsed.subscriptionId,
          parsed.namespace,
          parsed.resourceType,
        );
        const resource = await armFetch<Record<string, unknown>>({
          tenantId,
          path: `${encodeURI(resourceId)}?api-version=${apiVersion}`,
        });
        return { resource, apiVersion };
      },
      { freshAfter },
    );
  }
}

/** Split an ARM id into subscription, provider namespace and (possibly nested) resource type. */
export function parseResourceId(id: string): { subscriptionId: string; namespace: string; resourceType: string } {
  const parts = id.split("/").filter(Boolean);
  const lower = parts.map((p) => p.toLowerCase());
  const subscriptionId = parts[lower.indexOf("subscriptions") + 1];
  const p = lower.lastIndexOf("providers");
  if (!subscriptionId || p === -1 || !parts[p + 1])
    throw new AzureError(`Unsupported resource id: ${id}`, 400, "BadResourceId");
  const namespace = parts[p + 1]!;
  const rest = parts.slice(p + 2);
  const types = rest.filter((_, i) => i % 2 === 0);
  // Resources nested under another provider (e.g. extension resources) use the last provider segment.
  return { subscriptionId, namespace, resourceType: types.join("/") };
}
