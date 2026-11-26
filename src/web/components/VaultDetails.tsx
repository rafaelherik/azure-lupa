import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { VaultLogRange } from "../../shared/types";
import { RequestError, vaultApi } from "../lib/api";
import { portalUrl } from "../lib/format";
import { useViewState } from "../lib/state";
import { Button, Skeleton } from "./ui";

const TIME = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function DateValue({ value }: { value?: string }) {
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? (
    <time dateTime={value} title={value}>
      {TIME.format(timestamp)}
    </time>
  ) : (
    "Unknown"
  );
}

function LoadState({ error, retry, audit = false }: { error: Error | null; retry: () => void; audit?: boolean }) {
  if (!error)
    return (
      <div role="status" aria-label="Loading" className="space-y-2">
        <Skeleton className="w-2/3" />
        <Skeleton className="w-1/2" />
      </div>
    );
  const e = error instanceof RequestError ? error : undefined;
  const network = /firewall|public network|private endpoint|ForbiddenByConnection/i.test(`${e?.code} ${error.message}`);
  const basic = /basic|auxiliary/i.test(error.message) && audit;
  const message = basic
    ? "Open the Log Analytics workspace in Azure Portal to query Basic or Auxiliary tables."
    : e?.status === 403 && network
      ? "Check your network access to this vault, including its firewall and private endpoint."
      : e?.status === 403
        ? audit
          ? "Your account needs access to this vault’s Azure Monitor logs."
          : "Your account needs permission to list secret metadata."
        : !audit && (!e || e.status === 502) && !e?.code
          ? "Could not reach Key Vault. Check your network and private endpoint access."
          : audit
            ? "Could not load audit logs."
            : "Could not load secret metadata.";
  return (
    <div role="status" className="space-y-2 py-2 text-[13px]">
      <p className="text-danger">{message}</p>
      {e?.hint && <code className="block break-all text-muted">{e.hint}</code>}
      <Button size="sm" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}

export function VaultDetails({
  tenantId,
  id,
  tab,
  fullPage = false,
}: {
  tenantId: string;
  id: string;
  tab: "secrets" | "audit";
  fullPage?: boolean;
}) {
  const [expanded, setExpanded] = useState<string>();
  const [range, setRange] = useState<VaultLogRange>("24h");
  const [state, update] = useViewState();
  const filters = fullPage && state.auditFilters ? state.auditFilters : { range };
  const filtered = fullPage && (filters.range !== "24h" || Boolean(filters.actions?.length));
  const key = ["key-vault", tenantId, id];
  const options = { retry: false, staleTime: 60_000, gcTime: 5 * 60_000 };
  const secrets = useQuery({
    ...options,
    queryKey: [...key, "secrets"],
    queryFn: ({ signal }) => vaultApi.secrets(tenantId, id, signal),
    enabled: tab === "secrets",
  });
  const versions = useQuery({
    ...options,
    queryKey: [...key, "versions", expanded],
    queryFn: ({ signal }) => vaultApi.versions(tenantId, id, expanded!, signal),
    enabled: tab === "secrets" && Boolean(expanded),
  });
  const audit = useQuery({
    ...options,
    queryKey: [...key, "audit", filters, fullPage],
    queryFn: ({ signal }) => vaultApi.audit(tenantId, id, filters, signal, fullPage),
    enabled: tab === "audit",
  });
  const active = tab === "audit" ? audit : secrets;
  const refresh = () => {
    void active.refetch();
    if (tab === "secrets" && expanded) void versions.refetch();
  };

  return (
    <div className="space-y-3 px-5 py-3 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {tab === "audit" ? (
          fullPage ? null : (
            <select
              aria-label="Audit log time range"
              className="rounded-md border border-line bg-raised px-2 py-1"
              value={range}
              onChange={(event) => setRange(event.target.value as VaultLogRange)}
            >
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
            </select>
          )
        ) : (
          <h3 className="font-semibold">Secrets</h3>
        )}
        <Button size="sm" onClick={refresh} disabled={active.isFetching || (tab === "secrets" && versions.isFetching)}>
          Refresh
        </Button>
      </div>
      {(!active.data || active.error) && <LoadState error={active.error} retry={refresh} audit={tab === "audit"} />}
      {tab === "secrets" &&
        secrets.data &&
        (secrets.data.length ? (
          <div>
            <div className="flex justify-between gap-2 border-b border-line px-1 py-2 text-[12px] font-medium text-muted">
              <span>Secret</span>
              <span>Last updated (UTC)</span>
            </div>
            <ul>
              {secrets.data.map((secret) => (
                <li key={secret.name} className="border-b border-line">
                  <button
                    type="button"
                    aria-expanded={expanded === secret.name}
                    className="flex w-full flex-wrap items-start justify-between gap-x-3 gap-y-1 px-1 py-2 text-left hover:bg-hover"
                    onClick={() => setExpanded(expanded === secret.name ? undefined : secret.name)}
                  >
                    <span className="flex min-w-0 items-start gap-2 break-all font-medium">
                      {expanded === secret.name ? (
                        <ChevronDown className="mt-0.5 size-4 shrink-0" />
                      ) : (
                        <ChevronRight className="mt-0.5 size-4 shrink-0" />
                      )}
                      {secret.name}
                    </span>
                    <span className="ml-6 text-muted tabular-nums sm:ml-auto">
                      <DateValue value={secret.updated} />
                    </span>
                  </button>
                  {expanded === secret.name && (
                    <div className="mb-2 ml-5 border-l border-accent-line bg-panel px-2 py-1">
                      {(!versions.data || versions.error) && (
                        <LoadState error={versions.error} retry={() => void versions.refetch()} />
                      )}
                      {versions.data?.length === 0 && <p className="p-2 text-muted">No versions found.</p>}
                      {Boolean(versions.data?.length) && (
                        <ul aria-label="Secret versions">
                          {versions.data?.map((version) => (
                            <li key={version.version} className="space-y-1 border-b border-line py-2 last:border-0">
                              <div className="font-mono text-[11px] break-all">{version.version}</div>
                              <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                                <div>
                                  <dt className="text-muted">Created (UTC)</dt>
                                  <dd>
                                    <DateValue value={version.created} />
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-muted">Updated (UTC)</dt>
                                  <dd>
                                    <DateValue value={version.updated} />
                                  </dd>
                                </div>
                              </dl>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted">No secrets found.</p>
        ))}
      {tab === "audit" && audit.data && (
        <>
          {audit.data.partial && (
            <p role="status" className="text-warn">
              Azure Monitor returned partial results.
            </p>
          )}
          {audit.data.capped && <p className="text-muted">Showing the latest 100 events.</p>}
          {audit.data.events.length ? (
            <table className="w-full table-fixed text-left text-[12px]">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th scope="col" className={fullPage ? "w-[24%] py-2" : "w-[34%] py-2"}>
                    Time (UTC)
                  </th>
                  <th scope="col" className={fullPage ? "w-[24%]" : "w-[36%]"}>
                    Operation
                  </th>
                  <th scope="col">Result</th>
                  {fullPage && <th scope="col">Principal</th>}
                </tr>
              </thead>
              <tbody>
                {audit.data.events.map((event, index) => (
                  <tr key={index} className="border-b border-line align-top">
                    <td className="py-2 pr-2 tabular-nums">
                      <DateValue value={event.time} />
                    </td>
                    <td className="py-2 pr-2 break-words">{event.operation || "Unknown"}</td>
                    <td className="py-2 break-words">{event.result || "Unknown"}</td>
                    {fullPage && (
                      <td className="py-2 break-all">
                        {event.principalName ? (
                          <details>
                            <summary className="cursor-pointer">{event.principalName}</summary>
                            <span className="text-muted">
                              {event.principalType === "objectId" ? "Object ID" : "Application ID"} · {event.principal}
                            </span>
                          </details>
                        ) : (
                          event.principal || "Unavailable"
                        )}
                        {!event.principalName && event.principalType && event.principalType !== "upn" && (
                          <span className="block text-muted">
                            {event.principalType === "objectId" ? "Object ID" : "Application ID"}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : filtered ? (
            <div>
              <p>No events match these filters.</p>
              <Button size="sm" onClick={() => update({ auditFilters: { range: "24h" } })}>
                Clear filters
              </Button>
            </div>
          ) : (
            <p className="text-muted">
              No audit events are visible in this range. Check Diagnostic settings and workspace access in Azure Portal.
            </p>
          )}
        </>
      )}
      {tab === "audit" && (audit.error || audit.data?.events.length === 0) && (
        <a
          href={portalUrl(id, tenantId)}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-accent hover:underline"
        >
          Open in Azure Portal
        </a>
      )}
    </div>
  );
}
