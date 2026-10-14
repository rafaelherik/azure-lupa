import clsx from "clsx";
import { Monitor, Moon, PanelLeft, RefreshCw, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { DetailsPanel } from "./components/DetailsPanel";
import { ResourceTable } from "./components/ResourceTable";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { IconButton } from "./components/ui";
import { timeAgo } from "./lib/format";
import { refreshTenant, useSubscriptions, useSummary, useTenants } from "./lib/queries";
import { useViewState } from "./lib/state";
import { useTheme, type ThemeChoice } from "./lib/theme";
import { Toaster } from "./lib/toast";

const THEME_NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function App() {
  const [state, update] = useViewState();
  const [theme, setTheme] = useTheme();
  const [navOpen, setNavOpen] = useState(false);
  const now = useNow();
  const scope = useMemo(() => ({ tenantId: state.tenantId, subscriptionIds: state.subscriptionIds }), [state.tenantId, state.subscriptionIds]);
  const hasScope = Boolean(scope.tenantId && scope.subscriptionIds.length);
  const subs = useSubscriptions(state.tenantId ?? "", Boolean(state.tenantId));
  const tenants = useTenants();
  const scopeSummary = useSummary(scope);

  const subscriptionNames = useMemo(
    () => new Map((subs.data?.data ?? []).map((s) => [s.subscriptionId, s.displayName])),
    [subs.data],
  );
  const tenantName = tenants.data?.data.find((t) => t.tenantId === state.tenantId)?.displayName;
  const scopeLabel =
    scope.subscriptionIds.length === 1
      ? (subscriptionNames.get(scope.subscriptionIds[0]!) ?? scope.subscriptionIds[0])
      : `${scope.subscriptionIds.length} subscriptions`;

  useEffect(() => {
    document.title = hasScope ? `${scopeLabel} · azure-lupa` : "azure-lupa";
  }, [hasScope, scopeLabel]);

  useEffect(() => setNavOpen(false), [state.subscriptionIds, state.filters.resourceGroups]);

  const ThemeIcon = THEME_ICON[theme];
  const cached = scopeSummary.data;

  return (
    <div className="flex h-full">
      <div
        className={clsx(
          "fixed inset-y-0 left-0 z-30 w-[288px] transition-transform duration-200 lg:static lg:w-[272px] lg:translate-x-0",
          navOpen ? "translate-x-0 shadow-overlay" : "-translate-x-full",
        )}
      >
        <Sidebar />
      </div>
      {navOpen && <div className="fixed inset-0 z-20 bg-ink/20 lg:hidden" onClick={() => setNavOpen(false)} />}

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4 md:px-6">
          <IconButton label="Show tenants" className="lg:hidden" onClick={() => setNavOpen(true)}>
            <PanelLeft className="size-4" />
          </IconButton>
          {hasScope && (
            <div role="tablist" className="flex h-full gap-5">
              {(["resources", "dashboard"] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  type="button"
                  aria-selected={state.view === v}
                  onClick={() => update({ view: v })}
                  className={clsx(
                    "-mb-px h-full border-b-2 text-[13px] font-medium capitalize transition-colors duration-150",
                    state.view === v ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
          {hasScope && (
            <p className="hidden min-w-0 truncate text-[12px] text-muted md:block">
              <span className="text-faint">/</span> {tenantName ?? "Tenant"} <span className="text-faint">/</span>{" "}
              <span className="text-ink-2">{scopeLabel}</span>
            </p>
          )}
          <span className="flex-1" />
          {hasScope && cached && (
            <span className="flex items-center gap-2 text-[12px] whitespace-nowrap text-muted">
              <span aria-hidden className={clsx("size-1.5 rounded-full", scopeSummary.isFetching ? "animate-pulse bg-accent" : "bg-faint")} />
              <span className="hidden sm:inline">
                {scopeSummary.isFetching ? "Loading from Azure…" : `${cached.fromCache ? "Cached" : "Updated"} ${timeAgo(cached.cachedAt, now)}`}
              </span>
              <span className="hidden text-faint sm:inline">·</span>
              <button
                type="button"
                onClick={() => state.tenantId && refreshTenant(state.tenantId)}
                className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
              >
                <RefreshCw className="size-3" />
                Refresh
              </button>
            </span>
          )}
          <IconButton label={`Theme: ${theme} (click to change)`} onClick={() => setTheme(THEME_NEXT[theme])}>
            <ThemeIcon className="size-4" />
          </IconButton>
        </div>

        {hasScope ? (
          <>
            <Toolbar scope={scope} sort={state.sort} />
            <div className="relative flex min-h-0 flex-1">
              {state.view === "resources" ? (
                <ResourceTable scope={scope} sort={state.sort} subscriptionNames={subscriptionNames} />
              ) : (
                <Dashboard scope={scope} subscriptionNames={subscriptionNames} />
              )}
              {state.selectedId && state.tenantId && (
                <div className="absolute inset-0 z-10 flex lg:static lg:z-auto">
                  <DetailsPanel key={state.selectedId} tenantId={state.tenantId} id={state.selectedId} subscriptionNames={subscriptionNames} />
                </div>
              )}
            </div>
          </>
        ) : (
          <Welcome onOpenNav={() => setNavOpen(true)} />
        )}
      </main>
      <Toaster />
    </div>
  );
}

function Welcome({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="max-w-md">
        <h1 className="text-[18px] font-semibold">Pick a subscription to start</h1>
        <p className="mt-2 text-[13px] text-muted">
          Open a tenant in the sidebar and select a subscription. Hold <kbd>⌘</kbd> or <kbd>Ctrl</kbd> to add more, or use “Select all”.
          Nothing loads until you ask for it, and results are cached on this machine so the next visit is instant.
        </p>
        <ul className="mt-4 space-y-1.5 text-[13px] text-ink-2">
          <li>
            <kbd>/</kbd> search · <kbd>j</kbd> <kbd>k</kbd> move through rows · <kbd>↵</kbd> open details · <kbd>esc</kbd> close
          </li>
          <li>Select a resource group to filter, or a bar on the Dashboard to drill in.</li>
          <li>Export the current view as CSV or JSON from the toolbar.</li>
        </ul>
        <button type="button" onClick={onOpenNav} className="mt-5 text-[13px] font-medium text-accent hover:underline lg:hidden">
          Show tenants
        </button>
      </div>
    </div>
  );
}
