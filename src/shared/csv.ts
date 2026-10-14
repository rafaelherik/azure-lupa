import type { ResourceRow } from "./types.js";

export const CSV_COLUMNS: Array<keyof ResourceRow> = [
  "name",
  "type",
  "kind",
  "resourceGroup",
  "location",
  "subscriptionId",
  "tenantId",
  "sku",
  "provisioningState",
  "tags",
  "id",
];

export function csvCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  const s =
    typeof value === "object"
      ? Object.entries(value as Record<string, unknown>)
          .map(([k, v]) => `${k}=${String(v)}`)
          .join("; ")
      : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T extends object>(rows: T[], columns: Array<keyof T & string>): string {
  const lines = [columns.join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(","));
  return lines.join("\n") + "\n";
}
