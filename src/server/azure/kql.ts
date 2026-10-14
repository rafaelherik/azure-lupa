/** Quote a value as a KQL string literal. */
export function kqlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ")}"`;
}

export function resourceGroupsQuery(): string {
  return [
    "ResourceContainers",
    "| where type =~ 'microsoft.resources/subscriptions/resourcegroups'",
    "| project id, name, location, subscriptionId",
    "| order by name asc",
  ].join("\n");
}

export function resourceGroupCountsQuery(): string {
  return "Resources | summarize count = count() by resourceGroup = tolower(resourceGroup)";
}
