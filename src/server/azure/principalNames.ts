import type { VaultAudit } from "../../shared/types.js";
import { armFetch } from "./http.js";

const GUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const BATCH_SIZE = 20;

interface Lookup {
  id: string;
  url: string;
  field: "userPrincipalName" | "displayName";
}

async function readNames(tenantId: string, batch: Lookup[]) {
  const names = new Map<string, string>();
  try {
    const { responses } = await armFetch<{
      responses: Array<{ id: string; status: number; body?: Record<string, unknown> }>;
    }>({
      tenantId,
      scope: "https://graph.microsoft.com/.default",
      path: "https://graph.microsoft.com/v1.0/$batch",
      method: "POST",
      body: { requests: batch.map(({ id, url }) => ({ id, method: "GET", url })) },
    });
    for (const { id, status, body } of responses) {
      const lookup = batch.find((item) => item.id === id);
      const name = lookup && body?.[lookup.field];
      if (status === 200 && typeof name === "string" && name.trim()) names.set(id, name);
    }
  } catch {
    // Directory lookup is optional. Keep the audit records when Graph is unavailable.
  }
  return names;
}

export async function resolvePrincipalNames(tenantId: string, events: VaultAudit["events"]) {
  const lookups = new Map<string, Lookup>();
  for (const { principal, principalType } of events) {
    if (!principal || !GUID.test(principal)) continue;
    const id = principal.toLowerCase();
    if (principalType === "objectId") {
      // An object ID can identify either a user or a service principal.
      lookups.set(`user-${id}`, {
        id: `user-${id}`,
        url: `/users/${id}?$select=userPrincipalName`,
        field: "userPrincipalName",
      });
      lookups.set(`sp-${id}`, {
        id: `sp-${id}`,
        url: `/servicePrincipals/${id}?$select=displayName`,
        field: "displayName",
      });
    } else if (principalType === "appId") {
      lookups.set(`app-${id}`, {
        id: `app-${id}`,
        url: `/servicePrincipals(appId='${id}')?$select=displayName`,
        field: "displayName",
      });
    }
  }

  const requests = [...lookups.values()];
  const batches = [];
  for (let start = 0; start < requests.length; start += BATCH_SIZE) {
    batches.push(readNames(tenantId, requests.slice(start, start + BATCH_SIZE)));
  }
  const names = new Map((await Promise.all(batches)).flatMap((batch) => [...batch]));
  for (const event of events) {
    const id = event.principal?.toLowerCase();
    let name;
    if (event.principalType === "objectId") name = names.get(`user-${id}`) ?? names.get(`sp-${id}`);
    if (event.principalType === "appId") name = names.get(`app-${id}`);
    if (name) event.principalName = name;
  }
}
