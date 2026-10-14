import { AzureCliCredential } from "@azure/identity";
import { AzureError } from "./http.js";

const SCOPE = "https://management.azure.com/.default";
const REFRESH_MARGIN_MS = 5 * 60_000;

interface CachedToken {
  token: string;
  expiresOn: number;
}

const credentials = new Map<string, AzureCliCredential>();
const tokens = new Map<string, Promise<CachedToken>>();

function credentialFor(tenantId?: string) {
  const key = tenantId ?? "";
  let cred = credentials.get(key);
  if (!cred) {
    cred = new AzureCliCredential(tenantId ? { tenantId } : {});
    credentials.set(key, cred);
  }
  return cred;
}

/**
 * Returns an ARM access token from the Azure CLI for the given tenant (home tenant when omitted).
 * Tokens are cached in memory until shortly before expiry, since each CLI call spawns `az`.
 */
export async function getToken(tenantId?: string): Promise<string> {
  const key = tenantId ?? "";
  const cached = tokens.get(key);
  if (cached) {
    try {
      const t = await cached;
      if (t.expiresOn - REFRESH_MARGIN_MS > Date.now()) return t.token;
    } catch {
      // previous attempt failed; try again below
    }
  }

  const pending = credentialFor(tenantId)
    .getToken(SCOPE)
    .then((t) => ({ token: t.token, expiresOn: t.expiresOnTimestamp }))
    .catch((err: unknown) => {
      tokens.delete(key);
      const message = err instanceof Error ? err.message : String(err);
      throw new AzureError(
        tenantId ? `Could not get a token for tenant ${tenantId}` : "Could not get a token from the Azure CLI",
        401,
        "CliCredentialError",
        tenantId ? `Run: az login --tenant ${tenantId}` : `Run: az login (${message.split("\n")[0]})`,
      );
    });
  tokens.set(key, pending);
  return (await pending).token;
}
