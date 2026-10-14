// Orphan rules, after the Azure Orphaned Resources workbook (Microsoft FastTrack for Azure):
// https://github.com/dolevshor/azure-orphan-resources
//
// Each rule has two halves. `facts` runs on the server while the snapshot is built and keeps the
// few property values the rule needs, so the browser never receives full `properties`. `sql` is
// evaluated by DuckDB in the browser over the `resources` table (aliased `r`), where facts become
// the columns f_attached, f_count, f_state and f_expires.

export const ORPHAN_WORKBOOK_URL = "https://github.com/dolevshor/azure-orphan-resources";

export interface Facts {
  /** Id (or marker) of whatever the resource is attached to; null when attached to nothing. */
  attached?: string | null;
  /** Number of associations the rule cares about. */
  count?: number | null;
  state?: string | null;
  /** Epoch ms. */
  expires?: number | null;
}

export interface RuleSqlHelpers {
  /** Count of resources of `fromType` that reference this one. */
  inbound: (fromType: string) => string;
  /** Epoch ms at evaluation time. */
  now: number;
}

export interface OrphanRule {
  id: string;
  /** Lowercased resource type the rule applies to. */
  type: string;
  title: string;
  reason: string;
  learnUrl: string;
  facts?: (props: Record<string, unknown>) => Facts;
  sql: (h: RuleSqlHelpers) => string;
}

type Props = Record<string, unknown>;

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const len = (v: unknown) => arr(v).length;
const idOf = (v: unknown): string | null => {
  const id = v && typeof v === "object" ? (v as { id?: unknown }).id : undefined;
  return typeof id === "string" && id ? id : null;
};
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const props = (v: unknown): Props => (v && typeof v === "object" ? (v as { properties?: Props }).properties : {}) ?? {};

const LEARN = "https://learn.microsoft.com/azure";

/** Shorthand for rules that are orphaned when a list of associations is empty. */
function noAssociations(
  id: string,
  type: string,
  title: string,
  reason: string,
  learnUrl: string,
  count: (p: Props) => number,
): OrphanRule {
  return { id, type, title, reason, learnUrl, facts: (p) => ({ count: count(p) }), sql: () => "r.f_count = 0" };
}

export const ORPHAN_RULES: OrphanRule[] = [
  {
    id: "disk-unattached",
    type: "microsoft.compute/disks",
    title: "Unattached managed disk",
    reason: "Not attached to any VM. Unattached disks are still billed for their provisioned size.",
    learnUrl: `${LEARN}/virtual-machines/disks-find-unattached-portal`,
    facts: (p) => ({ state: typeof p.diskState === "string" ? p.diskState : null }),
    // Azure Site Recovery replica and seed disks are expected to be unattached.
    sql: () =>
      "coalesce(r.managed_by, '') = '' AND r.f_state = 'Unattached' AND NOT (r.name ILIKE '%-asrreplica' OR r.name ILIKE '%-asrseed')",
  },
  {
    id: "pip-unassociated",
    type: "microsoft.network/publicipaddresses",
    title: "Unassociated public IP",
    reason: "Not associated with any IP configuration or NAT gateway. Static public IPs are billed while idle.",
    learnUrl: `${LEARN}/virtual-network/ip-services/public-ip-addresses`,
    facts: (p) => ({ attached: idOf(p.ipConfiguration) ?? idOf(p.natGateway) }),
    sql: () => "r.f_attached IS NULL",
  },
  {
    id: "nic-unattached",
    type: "microsoft.network/networkinterfaces",
    title: "Detached network interface",
    reason: "Not attached to a VM, private endpoint or private link service.",
    learnUrl: `${LEARN}/virtual-network/virtual-network-network-interface`,
    facts: (p) => ({
      attached:
        idOf(p.virtualMachine) ??
        idOf(p.privateEndpoint) ??
        idOf(p.privateLinkService) ??
        (len(p.hostedWorkloads) ? "hostedWorkloads" : null),
    }),
    sql: () => "r.f_attached IS NULL",
  },
  noAssociations(
    "nsg-unassociated",
    "microsoft.network/networksecuritygroups",
    "Unassociated network security group",
    "Not associated with any subnet or network interface, so its rules apply to nothing.",
    `${LEARN}/virtual-network/network-security-groups-overview`,
    (p) => len(p.networkInterfaces) + len(p.subnets),
  ),
  noAssociations(
    "avset-empty",
    "microsoft.compute/availabilitysets",
    "Empty availability set",
    "Contains no virtual machines.",
    `${LEARN}/virtual-machines/availability-set-overview`,
    (p) => len(p.virtualMachines),
  ),
  {
    id: "plan-empty",
    type: "microsoft.web/serverfarms",
    title: "App Service plan without apps",
    reason: "Hosts no apps. A plan is billed for its instances whether or not apps run on it.",
    learnUrl: `${LEARN}/app-service/overview-hosting-plans`,
    facts: (p) => ({ count: num(p.numberOfSites) }),
    sql: () => "r.f_count = 0",
  },
  noAssociations(
    "rt-unassociated",
    "microsoft.network/routetables",
    "Unassociated route table",
    "Not associated with any subnet.",
    `${LEARN}/virtual-network/virtual-networks-udr-overview`,
    (p) => len(p.subnets),
  ),
  noAssociations(
    "lb-no-backend",
    "microsoft.network/loadbalancers",
    "Load balancer without backend pools",
    "Has no backend address pools. Standard load balancers are billed for their rules.",
    `${LEARN}/load-balancer/load-balancer-overview`,
    (p) => len(p.backendAddressPools),
  ),
  noAssociations(
    "fd-waf-unlinked",
    "microsoft.network/frontdoorwebapplicationfirewallpolicies",
    "Unlinked Front Door WAF policy",
    "Not linked to any Front Door endpoint, security policy or routing rule.",
    `${LEARN}/web-application-firewall/afds/afds-overview`,
    (p) => len(p.frontendEndpointLinks) + len(p.securityPolicyLinks) + len(p.routingRuleLinks),
  ),
  noAssociations(
    "tm-no-endpoints",
    "microsoft.network/trafficmanagerprofiles",
    "Traffic Manager profile without endpoints",
    "Has no endpoints to route traffic to.",
    `${LEARN}/traffic-manager/traffic-manager-overview`,
    (p) => len(p.endpoints),
  ),
  noAssociations(
    "agw-empty-backends",
    "microsoft.network/applicationgateways",
    "Application gateway without backend targets",
    "None of its backend pools has a target, so it forwards traffic nowhere.",
    `${LEARN}/application-gateway/overview`,
    (p) =>
      arr(p.backendAddressPools).reduce<number>(
        (n, pool) => n + len(props(pool).backendIPConfigurations) + len(props(pool).backendAddresses),
        0,
      ),
  ),
  noAssociations(
    "vnet-no-subnets",
    "microsoft.network/virtualnetworks",
    "Virtual network without subnets",
    "Has no subnets, so nothing can be deployed into it.",
    `${LEARN}/virtual-network/virtual-networks-overview`,
    (p) => len(p.subnets),
  ),
  noAssociations(
    "nat-unassociated",
    "microsoft.network/natgateways",
    "Unassociated NAT gateway",
    "Not associated with any subnet. NAT gateways are billed hourly.",
    `${LEARN}/nat-gateway/nat-overview`,
    (p) => len(p.subnets),
  ),
  noAssociations(
    "ipgroup-unused",
    "microsoft.network/ipgroups",
    "Unused IP group",
    "Not used by any Azure Firewall or firewall policy.",
    `${LEARN}/firewall/ip-groups`,
    (p) => len(p.firewalls) + len(p.firewallPolicies),
  ),
  {
    id: "pdns-unlinked",
    type: "microsoft.network/privatednszones",
    title: "Private DNS zone without VNet links",
    reason: "Not linked to any virtual network, so no client can resolve it.",
    learnUrl: `${LEARN}/dns/private-dns-virtual-network-links`,
    facts: (p) => ({ count: num(p.numberOfVirtualNetworkLinks) }),
    sql: () => "r.f_count = 0",
  },
  {
    id: "pe-disconnected",
    type: "microsoft.network/privateendpoints",
    title: "Disconnected private endpoint",
    reason: "Its connection to the target service is Disconnected, typically because the target was deleted.",
    learnUrl: `${LEARN}/private-link/private-endpoint-overview`,
    facts: (p) => {
      const conns = [...arr(p.privateLinkServiceConnections), ...arr(p.manualPrivateLinkServiceConnections)];
      const disconnected = conns.some(
        (c) =>
          (props(c).privateLinkServiceConnectionState as { status?: string } | undefined)?.status === "Disconnected",
      );
      return { state: disconnected ? "Disconnected" : null };
    },
    sql: () => "r.f_state = 'Disconnected'",
  },
  {
    id: "vng-no-connections",
    type: "microsoft.network/virtualnetworkgateways",
    title: "Virtual network gateway without connections",
    reason: "No site-to-site or ExpressRoute connection uses it and point-to-site is not configured.",
    learnUrl: `${LEARN}/vpn-gateway/vpn-gateway-about-vpngateways`,
    facts: (p) => {
      const vpn = p.vpnClientConfiguration as { vpnClientAddressPool?: { addressPrefixes?: unknown } } | undefined;
      return { count: len(vpn?.vpnClientAddressPool?.addressPrefixes) };
    },
    sql: (h) => `r.f_count = 0 AND ${h.inbound("microsoft.network/connections")} = 0`,
  },
  noAssociations(
    "ddos-unused",
    "microsoft.network/ddosprotectionplans",
    "DDoS protection plan without VNets",
    "Protects no virtual network. DDoS Network Protection has a significant fixed monthly charge.",
    `${LEARN}/ddos-protection/ddos-protection-overview`,
    (p) => len(p.virtualNetworks),
  ),
  {
    id: "apiconn-unused",
    type: "microsoft.web/connections",
    title: "Unused API connection",
    reason: "No Consumption Logic App in scope references it. Standard Logic Apps are not detected.",
    learnUrl: `${LEARN}/connectors/introduction`,
    sql: (h) => `${h.inbound("microsoft.logic/workflows")} = 0`,
  },
  {
    id: "cert-expired",
    type: "microsoft.web/certificates",
    title: "Expired certificate",
    reason: "The certificate has expired and can no longer secure a binding.",
    learnUrl: `${LEARN}/app-service/configure-ssl-certificate`,
    facts: (p) => {
      const t = typeof p.expirationDate === "string" ? Date.parse(p.expirationDate) : NaN;
      return { expires: Number.isNaN(t) ? null : t };
    },
    sql: (h) => `r.f_expires < ${h.now}`,
  },
  {
    id: "sqlpool-empty",
    type: "microsoft.sql/servers/elasticpools",
    title: "SQL elastic pool without databases",
    reason: "Contains no databases. Elastic pools are billed for their provisioned capacity.",
    learnUrl: `${LEARN}/azure-sql/database/elastic-pool-overview`,
    sql: (h) => `${h.inbound("microsoft.sql/servers/databases")} = 0`,
  },
];

/** Resource groups are containers, not rows in `resources`; their rule is evaluated separately. */
export const EMPTY_RG_RULE = {
  id: "rg-empty",
  title: "Empty resource group",
  reason: "Contains no resources.",
  learnUrl: `${LEARN}/azure-resource-manager/management/manage-resource-groups-portal`,
} as const;

export const RULES_BY_ID = new Map(ORPHAN_RULES.map((r) => [r.id, r]));
const RULES_BY_TYPE = new Map<string, OrphanRule[]>();
for (const r of ORPHAN_RULES) RULES_BY_TYPE.set(r.type, [...(RULES_BY_TYPE.get(r.type) ?? []), r]);

/** Facts for a resource, merged across every rule for its type; undefined when none needs any. */
export function factsFor(type: string, properties: unknown): Facts | undefined {
  const rules = RULES_BY_TYPE.get(type.toLowerCase())?.filter((r) => r.facts);
  if (!rules?.length) return undefined;
  const p = properties && typeof properties === "object" ? (properties as Props) : {};
  return Object.assign({}, ...rules.map((r) => r.facts!(p))) as Facts;
}
