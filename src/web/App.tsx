import clsx from "clsx";
import { Monitor, Moon, PanelLeft, RefreshCw, Sun } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AuditControls } from "./components/AuditFilters";
import { Dashboard } from "./components/Dashboard";
import { DetailsPanel } from "./components/DetailsPanel";
import { LogViewer } from "./components/LogViewer";
import { ResourceTable, TableError } from "./components/ResourceTable";
import { Sidebar } from "./components/Sidebar";
import { VaultDetails } from "./components/VaultDetails";
import { Toolbar } from "./components/Toolbar";
import { IconButton } from "./components/ui";
import { portalUrl, timeAgo } from "./lib/format";
import { refreshTenant, useSnapshot, useSubscriptions, useTenants } from "./lib/queries";
import { serialize, useViewState } from "./lib/state";
import { useTheme, type ThemeChoice } from "./lib/theme";
import { Toaster } from "./lib/toast";

const THEME_NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };
const MAIN_VIEWS = { resources: "Resources", dashboard: "Dashboard", logs: "Log Viewer" } as const;

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
  const sidebar = useRef<HTMLDivElement>(null);
  const navTrigger = useRef<HTMLButtonElement>(null);
  const wasNavOpen = useRef(false);
  const now = useNow();
  const scope = useMemo(
    () => ({ tenantId: state.tenantId, subscriptionIds: state.subscriptionIds }),
    [state.tenantId, state.subscriptionIds],
  );
  const hasScope = Boolean(scope.tenantId && scope.subscriptionIds.length);
  const subs = useSubscriptions(state.tenantId ?? "", Boolean(state.tenantId));
  const tenants = useTenants();
  const snapshot = useSnapshot(scope);

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
    const title = hasScope ? `${scopeLabel} · azure-lupa` : "azure-lupa";
    document.title = state.view === "logs" ? `Log Viewer · ${title}` : title;
  }, [hasScope, scopeLabel, state.view]);

  useEffect(() => setNavOpen(false), [state.subscriptionIds, state.filters.resourceGroups]);
  useEffect(() => {
    if (!navOpen) return;
    const desktop = window.matchMedia("(min-width: 64rem)");
    const dismiss = () => {
      if (desktop.matches) setNavOpen(false);
    };
    dismiss();
    desktop.addEventListener("change", dismiss);
    return () => desktop.removeEventListener("change", dismiss);
  }, [navOpen]);
  useLayoutEffect(() => {
    if (navOpen) sidebar.current?.querySelector("input")?.focus();
    else if (wasNavOpen.current) navTrigger.current?.focus();
    wasNavOpen.current = navOpen;
  }, [navOpen]);

  const ThemeIcon = THEME_ICON[theme];
  const cached = snapshot.data;
  const activitySchema = snapshot.isPlaceholderData || snapshot.isError ? undefined : cached?.schema;
  const auditId = state.view !== "logs" && state.vaultAudit ? state.selectedId : undefined;

  return (
    <div className="flex h-full">
      <div
        id="scope-sidebar"
        ref={sidebar}
        onKeyDown={(event) => {
          if (event.key === "Escape" && navOpen) {
            event.stopPropagation();
            setNavOpen(false);
          }
        }}
        className={clsx(
          "fixed inset-y-0 left-0 z-30 w-[288px] transition-transform duration-200 lg:static lg:w-[272px] lg:translate-x-0",
          navOpen ? "translate-x-0 shadow-overlay" : "invisible -translate-x-full lg:visible",
        )}
      >
        <Sidebar />
      </div>
      {navOpen && <div className="fixed inset-0 z-20 bg-ink/20 lg:hidden" onClick={() => setNavOpen(false)} />}

      <main inert={navOpen} className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2 sm:gap-3 sm:px-4 md:px-6">
          <button
            ref={navTrigger}
            type="button"
            aria-label="Show tenants"
            aria-controls="scope-sidebar"
            aria-expanded={navOpen}
            className="inline-grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-hover lg:hidden"
            onClick={() => setNavOpen(true)}
          >
            <PanelLeft aria-hidden className="size-4" />
          </button>
          <nav aria-label="Main navigation" className="flex h-full gap-2 sm:gap-5">
            {(Object.keys(MAIN_VIEWS) as (keyof typeof MAIN_VIEWS)[]).map((view) => (
              <a
                key={view}
                href={location.pathname + serialize({ ...state, view, vaultAudit: undefined })}
                aria-current={state.view === view && !auditId ? "page" : undefined}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  update({ view, vaultAudit: undefined });
                }}
                className={clsx(
                  "flex h-full items-center border-b-2 text-[13px] font-medium whitespace-nowrap transition-colors",
                  state.view === view ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
                )}
              >
                {MAIN_VIEWS[view]}
              </a>
            ))}
          </nav>
          {hasScope && (
            <p className="hidden min-w-0 truncate text-[12px] text-muted md:block">
              <span className="text-faint">/</span> {tenantName ?? "Tenant"} <span className="text-faint">/</span>{" "}
              <span className="text-ink-2">{scopeLabel}</span>
            </p>
          )}
          <span className="flex-1" />
          {hasScope && (cached || snapshot.isFetching) && (
            <span className="flex items-center gap-2 text-[12px] whitespace-nowrap text-muted">
              <span
                aria-hidden
                className={clsx("size-1.5 rounded-full", snapshot.isFetching ? "animate-pulse bg-accent" : "bg-faint")}
              />
              <span className="hidden sm:inline">
                {snapshot.isFetching || !cached
                  ? "Loading inventory from Azure…"
                  : `${cached.fromCache ? "Cached" : "Updated"} ${timeAgo(cached.cachedAt, now)}`}
              </span>
              <span className="hidden text-faint sm:inline">·</span>
              <button
                type="button"
                aria-label="Refresh inventory"
                onClick={() => state.tenantId && refreshTenant(state.tenantId)}
                className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
              >
                <RefreshCw className="size-3" />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </span>
          )}
          <IconButton label={`Theme: ${theme} (click to change)`} onClick={() => setTheme(THEME_NEXT[theme])}>
            <ThemeIcon className="size-4" />
          </IconButton>
        </div>

        {state.view === "logs" ? (
          <LogViewer
            key={JSON.stringify([scope.tenantId, [...scope.subscriptionIds].sort(), activitySchema])}
            tenantId={hasScope ? scope.tenantId : undefined}
            schema={activitySchema}
            discoveryFailed={snapshot.isError}
            retryDiscovery={() => void snapshot.refetch()}
            subscriptionNames={subs.isPlaceholderData ? undefined : subscriptionNames}
            onOpenNav={() => setNavOpen(true)}
          />
        ) : hasScope && auditId && state.tenantId ? (
          <section aria-labelledby="vault-audit-title" className="min-h-0 flex-1 overflow-auto">
            <header className="border-b border-line px-5 py-4">
              <button
                type="button"
                onClick={() => update({ vaultAudit: undefined })}
                className="text-[13px] text-accent hover:underline"
              >
                Back to vault
              </button>
              <h1 id="vault-audit-title" className="mt-2 text-lg font-semibold">
                Key Vault audit logs
              </h1>
              <a
                href={portalUrl(auditId, state.tenantId)}
                target="_blank"
                rel="noreferrer"
                className="break-all text-[13px] text-accent hover:underline"
              >
                {auditId.split("/").at(-1)} in Azure Portal
              </a>
              <AuditControls
                key={auditId}
                tenantId={state.tenantId}
                id={auditId}
                schema={snapshot.isPlaceholderData ? undefined : cached?.schema}
                subscriptions={subscriptionNames}
              />
            </header>
            <VaultDetails
              key={`${state.tenantId}:${auditId}`}
              tenantId={state.tenantId}
              id={auditId}
              tab="audit"
              fullPage
            />
          </section>
        ) : hasScope ? (
          <>
            <Toolbar scope={scope} sort={state.sort} />
            <div className="relative flex min-h-0 flex-1">
              {snapshot.error && !snapshot.isFetching ? (
                <TableError error={snapshot.error} onRetry={() => void snapshot.refetch()} />
              ) : state.view === "resources" ? (
                <ResourceTable scope={scope} sort={state.sort} subscriptionNames={subscriptionNames} />
              ) : (
                <Dashboard scope={scope} subscriptionNames={subscriptionNames} />
              )}
              {state.selectedId && state.tenantId && (
                <div className="absolute inset-0 z-10 flex lg:static lg:z-auto">
                  <DetailsPanel
                    key={`${state.tenantId}:${state.selectedId}`}
                    tenantId={state.tenantId}
                    id={state.selectedId}
                    subscriptionNames={subscriptionNames}
                  />
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
          Open a tenant in the sidebar and select a subscription. Hold <kbd>⌘</kbd> or <kbd>Ctrl</kbd> to add more, or
          use “Select all”. Nothing loads until you ask for it, and results are cached on this machine so the next visit
          is instant.
        </p>
        <ul className="mt-4 space-y-1.5 text-[13px] text-ink-2">
          <li>Select a resource group to filter, or a bar on the Dashboard to drill in.</li>
          <li>Export the current view as CSV or JSON from the toolbar.</li>
        </ul>
        <button
          type="button"
          onClick={onOpenNav}
          className="mt-5 text-[13px] font-medium text-accent hover:underline lg:hidden"
        >
          Show tenants
        </button>
      </div>
    </div>
  );
}
