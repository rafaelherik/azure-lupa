import { validAuditDates, type AuditFilters } from "../../shared/types.js";
import type { VaultAudit, VaultLogRange, VaultSecret, VaultSecretVersion } from "../../shared/types.js";
import { armFetch, AzureError } from "./http.js";
import type { Inventory } from "./inventory.js";
import { resolvePrincipalNames } from "./principalNames.js";

const VAULT_ID =
  /^\/subscriptions\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/resourcegroups\/([\p{L}\p{N}_.()-]{1,90})\/providers\/microsoft\.keyvault\/vaults\/([a-z][a-z0-9-]{1,22}[a-z0-9])$/iu;
const SECRET_NAME = /^[a-z0-9-]{1,127}$/i;
const VERSION = /^[a-f0-9]{32}$/i;

export function vaultIdParts(id: string) {
  const match = VAULT_ID.exec(id);
  if (!match || match[2]!.endsWith(".") || match[3]!.includes("--")) {
    throw new AzureError("Select a valid Key Vault resource", 400, "BadVaultId");
  }
  return { name: match[3]!.toLowerCase(), path: id.split("/").map(encodeURIComponent).join("/") };
}

interface SecretItem {
  id: string;
  attributes?: { created?: number; updated?: number };
}

function timestamp(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 8.64e12) return undefined;
  return new Date(value * 1000).toISOString();
}

async function listMetadata(inventory: Pick<Inventory, "details">, tenantId: string, id: string, secret?: string) {
  const { name } = vaultIdParts(id);
  const origin = `https://${name}.vault.azure.net`;
  const details = await inventory.details(tenantId, id);
  const properties = details.data.resource.properties as { vaultUri?: string } | undefined;
  if (properties?.vaultUri?.toLowerCase().replace(/\/$/, "") !== origin) {
    throw new AzureError("This vault endpoint is unsupported", 422, "UnsupportedVaultEndpoint");
  }
  const listPath = secret ? `/secrets/${secret}/versions` : "/secrets";
  let next: string | undefined = `${origin}${listPath}?api-version=2025-07-01&maxresults=25`;
  const seen = new Set<string>();
  const items: SecretItem[] = [];
  while (next) {
    const url = new URL(next, origin);
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.pathname !== listPath ||
      url.hash ||
      seen.has(url.href)
    ) {
      throw new AzureError("Key Vault returned an invalid continuation", 502, "BadVaultContinuation");
    }
    seen.add(url.href);
    const page: { value: SecretItem[]; nextLink?: string } = await armFetch({
      tenantId,
      path: url.href,
      scope: "https://vault.azure.net/.default",
    });
    items.push(...page.value);
    next = page.nextLink;
  }
  return items;
}

export async function listVaultSecrets(
  inventory: Pick<Inventory, "details">,
  tenantId: string,
  id: string,
): Promise<VaultSecret[]> {
  return (await listMetadata(inventory, tenantId, id))
    .flatMap(({ id, attributes }) => {
      const name = new URL(id).pathname.split("/")[2];
      return name && SECRET_NAME.test(name) ? [{ name, updated: timestamp(attributes?.updated) }] : [];
    })
    .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? "") || a.name.localeCompare(b.name));
}

export async function listVaultVersions(
  inventory: Pick<Inventory, "details">,
  tenantId: string,
  id: string,
  name: string,
): Promise<VaultSecretVersion[]> {
  if (!SECRET_NAME.test(name)) throw new AzureError("Invalid secret name", 400, "BadSecretName");
  return (await listMetadata(inventory, tenantId, id, name))
    .flatMap(({ id, attributes }) => {
      const version = new URL(id).pathname.split("/")[3];
      return version && VERSION.test(version)
        ? [{ version, created: timestamp(attributes?.created), updated: timestamp(attributes?.updated) }]
        : [];
    })
    .sort((a, b) => (b.created ?? "").localeCompare(a.created ?? "") || a.version.localeCompare(b.version));
}

const AUDIT_QUERY = `
let EmptyAudit = datatable(TimeGenerated:datetime, OperationName:string, ResultType:string, Upn:string, ObjectId:string, AppId:string) [];
union isfuzzy=true EmptyAudit,
  (AzureDiagnostics
    | where Category == "AuditEvent"
    | extend Extra = column_ifexists("AdditionalFields", dynamic({}))
    | project TimeGenerated, OperationName, ResultType,
      Upn = coalesce(tostring(column_ifexists("identity_claim_upn_s", "")), tostring(Extra.identity_claim_upn_s)),
      ObjectId = coalesce(tostring(column_ifexists("identity_claim_oid_g", "")),
        tostring(column_ifexists("identity_claim_http_schemas_microsoft_com_identity_claims_objectidentifier_g", "")),
        tostring(Extra.identity_claim_oid_g), tostring(Extra.identity_claim_http_schemas_microsoft_com_identity_claims_objectidentifier_g)),
      AppId = coalesce(tostring(column_ifexists("identity_claim_appid_g", "")), tostring(Extra.identity_claim_appid_g))),
  (AZKVAuditLogs
    | extend Claims = coalesce(Identity.claim, Identity.claims, Identity)
    | project TimeGenerated, OperationName, ResultType,
      Upn = coalesce(tostring(Claims.upn), tostring(Claims["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn"])),
      ObjectId = coalesce(tostring(Claims.oid), tostring(Claims["http://schemas.microsoft.com/identity/claims/objectidentifier"])),
      AppId = coalesce(tostring(Claims.appid), tostring(Claims.azp)))
 `;
const durations = { "1h": "PT1H", "6h": "PT6H", "24h": "PT24H", "7d": "P7D", "30d": "P30D" };

async function queryAudit(tenantId: string, id: string, filters: AuditFilters, pipeline: string) {
  let timespan: string;
  let timeFilter = "";
  if (filters.range === "custom") {
    if (!validAuditDates(filters.from, filters.to)) throw new AzureError("Select valid UTC start and end dates", 400);
    const end = new Date(Date.parse(filters.to! + "T00:00:00Z") + 86400000).toISOString();
    timespan = filters.from + "T00:00:00Z/" + end;
    timeFilter = "| where TimeGenerated < datetime(" + end + ")";
  } else {
    timespan = durations[filters.range];
  }
  const { path } = vaultIdParts(id);
  const response = await armFetch<{
    tables?: Array<{ name: string; columns: Array<{ name: string }>; rows: unknown[][] }>;
    error?: { code?: string };
  }>({
    tenantId,
    scope: "https://api.loganalytics.io/.default",
    path: `https://api.loganalytics.azure.com/v1${path}/query`,
    method: "POST",
    body: { query: [AUDIT_QUERY, timeFilter, pipeline].join("\n"), timespan },
  });
  const table = response.tables?.find((table) => table.name === "PrimaryResult");
  if (!table && !response.error) throw new AzureError("Azure Monitor returned an invalid result", 502);
  return { table, partial: Boolean(response.error) };
}

export async function vaultActions(tenantId: string, id: string, filters: AuditFilters) {
  const { table, partial } = await queryAudit(
    tenantId,
    id,
    filters,
    "| where isnotempty(OperationName) | distinct OperationName | sort by OperationName asc",
  );
  return { actions: (table?.rows ?? []).map((row) => String(row[0])), partial };
}

export async function vaultAudit(
  tenantId: string,
  id: string,
  range: VaultLogRange,
  resolvePrincipals = false,
  options: Omit<AuditFilters, "range"> = {},
): Promise<VaultAudit> {
  const actions = options.actions ?? [];
  const filter = actions.length ? "| where OperationName in (dynamic(" + JSON.stringify(actions) + "))" : "";
  const { table, partial } = await queryAudit(
    tenantId,
    id,
    { ...options, range },
    filter +
      "\n| top 101 by TimeGenerated desc\n| project TimeGenerated, OperationName, ResultType, Upn, ObjectId, AppId",
  );
  const indexes = ["TimeGenerated", "OperationName", "ResultType", "Upn", "ObjectId", "AppId"].map(
    (name) => table?.columns.findIndex((column) => column.name === name) ?? -1,
  );
  const rows = table?.rows ?? [];
  const events: VaultAudit["events"] = rows.slice(0, 100).map((row) => {
    const [time, operation, result, upn, objectId, appId] = indexes.map((index) => String(row[index] ?? ""));
    const event = { time: time!, operation: operation!, result: result! };
    if (upn) return { ...event, principal: upn, principalType: "upn" };
    if (objectId) return { ...event, principal: objectId, principalType: "objectId" };
    if (appId) return { ...event, principal: appId, principalType: "appId" };
    return event;
  });
  if (resolvePrincipals) await resolvePrincipalNames(tenantId, events);
  return {
    events,
    capped: rows.length > 100,
    partial,
  };
}
