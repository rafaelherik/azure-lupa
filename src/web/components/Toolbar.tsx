import clsx from "clsx";
import { Check, ChevronDown, Download, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CountBucket, ResourceFilters } from "../../shared/types";
import { api } from "../lib/api";
import { nf, typeWithinProvider } from "../lib/format";
import { useSummary, type Scope, type Sort } from "../lib/queries";
import { hasFilters, useViewState } from "../lib/state";
import { Button, Popover } from "./ui";

type FacetKey = "types" | "locations" | "resourceGroups";

const FACETS: Array<{ key: FacetKey; label: string; bucket: "byType" | "byLocation" | "byResourceGroup"; format?: (v: string) => string }> = [
  { key: "types", label: "Type", bucket: "byType", format: typeWithinProvider },
  { key: "locations", label: "Location", bucket: "byLocation" },
  { key: "resourceGroups", label: "Resource group", bucket: "byResourceGroup" },
];

export function Toolbar({ scope, sort }: { scope: Scope; sort: Sort }) {
  const [state, update] = useViewState();
  const facets = useSummary(scope); // unfiltered: the option lists for every chip
  const setFilters = (patch: Partial<ResourceFilters>) =>
    update((s) => ({ filters: { ...s.filters, ...patch }, selectedId: undefined }), { replace: true });

  return (
    <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3 md:px-6">
      <SearchBox value={state.filters.search ?? ""} onChange={(search) => setFilters({ search: search || undefined })} />
      {FACETS.map((f) => (
        <FacetChip
          key={f.key}
          label={f.label}
          format={f.format}
          options={facets.data?.data[f.bucket] ?? []}
          loading={facets.isPending}
          selected={state.filters[f.key] ?? []}
          onChange={(values) => setFilters({ [f.key]: values })}
        />
      ))}
      <TagChip selected={state.filters.tags ?? []} onChange={(tags) => setFilters({ tags })} />
      {hasFilters(state.filters) && (
        <Button variant="ghost" size="sm" onClick={() => setFilters({ search: undefined, types: [], locations: [], resourceGroups: [], tags: [] })}>
          Clear filters
        </Button>
      )}
      <span className="flex-1" />
      <ExportMenu scope={scope} filters={state.filters} sort={sort} />
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChange(text.trim()), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(target.tagName)) {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <label className="relative w-full sm:w-80">
      <span className="sr-only">Search resources</span>
      <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-faint" />
      <input
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            if (text) setText("");
            else e.currentTarget.blur();
          }
          if (e.key === "Enter") onChange(text.trim());
        }}
        placeholder="Search name, type or resource group"
        className="h-8 w-full rounded-md border border-line bg-raised pr-8 pl-8 text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-ring"
      />
      {!text && <kbd className="pointer-events-none absolute top-2 right-2">/</kbd>}
      {text && (
        <button type="button" aria-label="Clear search" onClick={() => setText("")} className="absolute top-2 right-2 text-faint hover:text-ink">
          <X className="size-4" />
        </button>
      )}
    </label>
  );
}

function chipLabel(label: string, selected: string[], format?: (v: string) => string) {
  if (!selected.length) return label;
  const first = format ? format(selected[0]!) : selected[0];
  return `${label}: ${first}${selected.length > 1 ? ` +${selected.length - 1}` : ""}`;
}

function ChipButton({ active, label, onToggle, onClear }: { active: boolean; label: string; onToggle: () => void; onClear: () => void }) {
  return (
    <div
      className={clsx(
        "inline-flex h-8 items-center rounded-md text-[12px] font-medium transition-colors duration-150",
        active ? "border border-accent-line bg-accent-soft text-accent-ink" : "border border-dashed border-faint bg-raised text-ink-2 hover:bg-hover",
      )}
    >
      <button type="button" onClick={onToggle} className="inline-flex h-full max-w-56 items-center gap-1.5 truncate pr-2.5 pl-2.5">
        {!active && <Plus className="size-3.5 text-faint" />}
        <span className="truncate">{label}</span>
      </button>
      {active && (
        <button type="button" aria-label={`Remove ${label}`} onClick={onClear} className="grid h-full place-items-center pr-2 hover:text-ink">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function FacetChip({
  label,
  options,
  selected,
  onChange,
  loading,
  format,
}: {
  label: string;
  options: CountBucket[];
  selected: string[];
  onChange: (v: string[]) => void;
  loading: boolean;
  format?: (v: string) => string;
}) {
  const [query, setQuery] = useState("");
  const sel = useMemo(() => new Set(selected.map((s) => s.toLowerCase())), [selected]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.key && (!q || o.key.toLowerCase().includes(q))).slice(0, 200);
  }, [options, query]);
  const toggle = (key: string) => onChange(sel.has(key.toLowerCase()) ? selected.filter((s) => s.toLowerCase() !== key.toLowerCase()) : [...selected, key]);

  return (
    <Popover
      width={320}
      trigger={({ toggle: open }) => (
        <ChipButton active={selected.length > 0} label={chipLabel(label, selected, format)} onToggle={open} onClear={() => onChange([])} />
      )}
    >
      {() => (
        <div>
          <div className="border-b border-line p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && shown[0]) toggle(shown[0].key);
              }}
              placeholder={`Filter ${label.toLowerCase()}s`}
              className="h-7 w-full rounded border border-line bg-bg px-2 text-[12px] outline-none placeholder:text-faint focus:border-accent"
            />
          </div>
          <ul className="max-h-80 overflow-y-auto p-1" role="listbox" aria-multiselectable>
            {loading && <li className="px-2 py-1.5 text-[12px] text-muted">Loading options…</li>}
            {!loading && shown.length === 0 && <li className="px-2 py-1.5 text-[12px] text-muted">Nothing matches.</li>}
            {shown.map((o) => {
              const on = sel.has(o.key.toLowerCase());
              return (
                <li key={o.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => toggle(o.key)}
                    title={o.key}
                    className="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[12px] hover:bg-hover"
                  >
                    <span className={clsx("grid size-3.5 shrink-0 place-items-center rounded-[3px] border", on ? "border-accent bg-accent text-bg" : "border-faint")}>
                      {on && <Check className="size-2.5" strokeWidth={3} />}
                    </span>
                    <span className="truncate">{format ? format(o.key) : o.key}</span>
                    {format && <span className="truncate font-mono text-[11px] text-faint">{o.key.split("/")[0]}</span>}
                    <span className="ml-auto shrink-0 text-faint">{nf.format(o.count)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Popover>
  );
}

function TagChip({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("");
  return (
    <Popover
      width={300}
      trigger={({ toggle }) => <ChipButton active={selected.length > 0} label={chipLabel("Tag", selected)} onToggle={toggle} onClear={() => onChange([])} />}
    >
      {() => (
        <form
          className="p-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = text.trim();
            if (v && !selected.includes(v)) onChange([...selected, v]);
            setText("");
          }}
        >
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="env=prod, or just a key like owner"
            className="h-7 w-full rounded border border-line bg-bg px-2 font-mono text-[12px] outline-none placeholder:font-sans placeholder:text-faint focus:border-accent"
          />
          <p className="mt-1.5 text-[11px] text-muted">Press Enter to add. Every tag filter must match.</p>
          {selected.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1">
              {selected.map((t) => (
                <li key={t} className="inline-flex h-6 items-center gap-1 rounded bg-hover pr-1 pl-2 font-mono text-[11px]">
                  {t}
                  <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(selected.filter((s) => s !== t))} className="text-faint hover:text-ink">
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}
    </Popover>
  );
}

function ExportMenu({ scope, filters, sort }: { scope: Scope; filters: ResourceFilters; sort: Sort }) {
  const disabled = !scope.tenantId || !scope.subscriptionIds.length;
  const url = (format: "csv" | "json") =>
    api.exportUrl({ tenantId: scope.tenantId!, subscriptionIds: scope.subscriptionIds, filters, sort }, format);
  return (
    <Popover
      align="end"
      width={240}
      trigger={({ toggle }) => (
        <Button onClick={toggle} disabled={disabled}>
          <Download className="size-3.5" />
          Export
          <ChevronDown className="size-3.5 text-faint" />
        </Button>
      )}
    >
      {(close) => (
        <div className="p-1">
          {(["csv", "json"] as const).map((f) => (
            <a
              key={f}
              href={disabled ? undefined : url(f)}
              onClick={close}
              className="flex flex-col rounded px-2.5 py-1.5 hover:bg-hover"
            >
              <span className="text-[12px] font-medium">{f.toUpperCase()}</span>
              <span className="text-[11px] text-muted">{f === "csv" ? "Spreadsheet-friendly, tags flattened" : "One object per resource"}</span>
            </a>
          ))}
          <p className="border-t border-line px-2.5 pt-1.5 pb-1 text-[11px] text-muted">Exports every resource matching the current filters.</p>
        </div>
      )}
    </Popover>
  );
}
