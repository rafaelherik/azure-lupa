import { useLayoutEffect, useMemo, useState } from "react";
import { activityRanges, type ActivityRange, type ActivityResult } from "../../shared/types";
import { api, RequestError } from "../lib/api";
import { latestRun } from "../lib/latestRun";
import { useActivityTargets } from "../lib/queries";
import { Button } from "./ui";

const SOURCE = "Azure Activity Log";
const labels: Record<ActivityRange, string> = { "1h": "Last 1 hour", "24h": "Last 24 hours", "7d": "Last 7 days" };
const control = "w-full min-w-0 rounded-md border border-line bg-raised px-2 py-1 text-ink";
const field = "flex min-w-0 flex-col gap-1 text-xs font-medium text-muted";
const denied = "Access denied. Your Azure CLI account lacks permission to read the Activity Log for this resource.";
const signIn = "Azure sign-in is no longer valid. Sign in again with the Azure CLI, then retry.";
const throttled = "Azure is throttling Activity Log reads. Wait a moment and try again.";

type RunState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "failure"; message: string }
  | { kind: "success"; result: ActivityResult };

function failureMessage(error: unknown) {
  if (error instanceof RequestError) {
    if (error.status === 403) return denied;
    if (error.status === 401) {
      if (error.code) return signIn;
      return "The local session is no longer valid. Reopen the URL printed by azure-lupa.";
    }
    if (error.status === 429) return throttled;
    if (error.status === 504 || error.status === 408) {
      return "The Activity Log read timed out. Try a shorter time range or retry.";
    }
    if (error.status === 400)
      return "This resource could not be used as an Activity Log target. Select another resource.";
  }
  return "Could not read the Activity Log. Check your connection to Azure and try again.";
}

const incompleteReasons: Record<NonNullable<ActivityResult["incomplete"]>, string> = {
  "event-limit": "The 500-event limit was reached.",
  "page-limit": "The page limit was reached.",
  "invalid-continuation": "Azure returned an invalid next page link.",
  "access-denied": denied,
  "sign-in": signIn,
  throttled,
  timeout: "Reading the remaining pages timed out.",
  "upstream-error": "Azure could not return all pages.",
  "invalid-event": "Azure returned an event that could not be displayed.",
};

interface LogViewerProps {
  tenantId?: string;
  schema?: string;
  discoveryFailed: boolean;
  retryDiscovery: () => void;
  subscriptionNames?: Map<string, string>;
  onOpenNav: () => void;
}

export function LogViewer({
  tenantId,
  schema,
  discoveryFailed,
  retryDiscovery,
  subscriptionNames,
  onOpenNav,
}: LogViewerProps) {
  const targets = useActivityTargets(schema);
  const [search, setSearch] = useState("");
  const [id, setId] = useState("");
  const [range, setRange] = useState<ActivityRange>("24h");
  const [state, setState] = useState<RunState>({ kind: "idle" });
  const [run] = useState(latestRun);
  useLayoutEffect(() => run.clear, [run]);

  const choices = useMemo(
    () =>
      (targets.data ?? []).map((target) => {
        const name = subscriptionNames?.get(target.subscriptionId);
        const subscription = name ? `${name} (${target.subscriptionId})` : target.subscriptionId;
        const providerPath = target.id.replace(/^\/subscriptions\/[^/]+(?:\/resourceGroups\/[^/]+)?\//i, "");
        const label = `${target.name} · ${target.resourceGroup || "Subscription level"} · ${subscription} · ${providerPath}`;
        return { ...target, label, searchText: `${label} ${target.type} ${target.id}`.toLowerCase() };
      }),
    [targets.data, subscriptionNames],
  );
  const matches = (value: string, choice: (typeof choices)[number]) =>
    choice.searchText.includes(value.trim().toLowerCase());
  const filtered = choices.filter((choice) => matches(search, choice));
  const selected = filtered.find((choice) => choice.id === id);
  const failed = discoveryFailed || targets.isError;
  const loading = Boolean(tenantId && !failed && (!schema || targets.isPending));

  function reset() {
    run.clear();
    setState({ kind: "idle" });
  }

  function submit() {
    if (!tenantId || !selected || failed || loading) return;
    setState({ kind: "loading" });
    void run.start((signal) => api.activity({ tenantId, id: selected.id, range }, signal), {
      success: (result) => setState({ kind: "success", result }),
      failure: (error) => setState({ kind: "failure", message: failureMessage(error) }),
    });
  }

  const result = state.kind === "success" ? state.result : undefined;
  return (
    <section aria-labelledby="log-viewer-title" className="min-h-0 flex-1 space-y-5 overflow-auto p-4 sm:p-6">
      <header>
        <h1 id="log-viewer-title" className="text-lg font-semibold">
          Log Viewer
        </h1>
        <p className="mt-1 text-muted">
          Monitor reads the Azure Activity Log: management events for an Azure resource, not application or runtime
          logs.
        </p>
      </header>
      {!tenantId ? (
        <div>
          <p>Select a tenant and at least one subscription in the sidebar to find a resource.</p>
          <Button onClick={onOpenNav} className="mt-2 lg:hidden">
            Show tenants
          </Button>
        </div>
      ) : (
        <>
          <div className="grid items-end gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
            <label className={field}>
              Source
              <select className={control}>
                <option>Monitor</option>
              </select>
            </label>
            <div className="grid min-w-0 gap-2">
              <label className={field}>
                Search resources
                <input
                  type="search"
                  className={control}
                  disabled={failed || loading || !choices.length}
                  value={search}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSearch(value);
                    if (selected && !matches(value, selected)) {
                      setId("");
                      reset();
                    }
                  }}
                />
              </label>
              <label className={field}>
                Resource
                <select
                  className={control}
                  value={selected?.id ?? ""}
                  disabled={failed || loading || !filtered.length}
                  onChange={(event) => {
                    setId(event.target.value);
                    reset();
                  }}
                >
                  <option value="">Select a resource</option>
                  {filtered.map((choice) => (
                    <option value={choice.id} key={choice.id}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className={field}>
              Time range
              <select
                className={control}
                value={range}
                onChange={(event) => {
                  setRange(event.target.value as ActivityRange);
                  reset();
                }}
              >
                {activityRanges.map((preset) => (
                  <option key={preset} value={preset}>
                    {labels[preset]}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="primary" onClick={submit} disabled={!selected || failed || loading}>
              Run
            </Button>
          </div>
          <div role="status">
            {loading
              ? "Loading resources in the selected subscriptions…"
              : failed
                ? "Could not discover resources in the selected subscriptions."
                : !choices.length
                  ? "No visible resources in the selected subscriptions."
                  : !filtered.length
                    ? "No resources match your search."
                    : null}
          </div>
          {failed && (
            <Button onClick={discoveryFailed ? retryDiscovery : () => void targets.refetch()}>Retry discovery</Button>
          )}
          {selected && <p className="text-muted break-all">Selected resource: {selected.id}</p>}
          <div role="status">
            {state.kind === "loading" && "Reading Azure Activity Log…"}
            {result && (
              <>
                {result.incomplete && (
                  <p className="font-medium text-warn">Incomplete results. {incompleteReasons[result.incomplete]}</p>
                )}
                {result.events.length
                  ? `${result.events.length} ${result.events.length === 1 ? "event" : "events"} returned.`
                  : result.incomplete
                    ? "No events were returned before the read stopped."
                    : "No events in this window."}
              </>
            )}
          </div>
          {state.kind === "failure" && selected && (
            <p role="alert" className="break-all text-danger">
              Activity Log for {selected.name}: {state.message}
            </p>
          )}
          {result && <ActivityResults result={result} />}
        </>
      )}
    </section>
  );
}

function ActivityResults({ result }: { result: ActivityResult }) {
  return (
    <div className="space-y-2">
      <h2 id="activity-results-title" className="font-semibold">
        {SOURCE} results
      </h2>
      <p className="break-all text-muted">{result.resourceId}</p>
      <p className="text-muted">
        UTC window: <time>{result.from}</time> to <time>{result.to}</time>
      </p>
      {!!result.events.length && (
        <div
          role="region"
          aria-label="Activity Log events"
          tabIndex={0}
          className="overflow-x-auto rounded-md border border-line"
        >
          <table aria-labelledby="activity-results-title" className="w-full min-w-max text-left">
            <thead className="bg-panel">
              <tr>
                {["Time (UTC)", "Operation", "Status", "Caller"].map((header) => (
                  <th key={header} scope="col" className="px-3 py-2">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.events.map((event, index) => (
                <tr key={index} className="border-t border-line">
                  <td className="px-3 py-2">
                    <time>{event.time}</time>
                  </td>
                  <td className="px-3 py-2">{event.operation || "—"}</td>
                  <td className="px-3 py-2">{event.status || "—"}</td>
                  <td className="px-3 py-2">{event.caller || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
