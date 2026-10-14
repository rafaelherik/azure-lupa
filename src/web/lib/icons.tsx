import type { AzureIconProps } from "@threeveloper/azure-react-icons/dist/types";
import clsx from "clsx";
import { useSyncExternalStore, type ComponentType } from "react";
import {
  Activity,
  AppWindow,
  Box,
  Container,
  Database,
  Fingerprint,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  Network,
  Radio,
  Server,
  Shield,
  Workflow,
  type LucideIcon,
} from "lucide-react";

const BY_PROVIDER: Array<[RegExp, LucideIcon]> = [
  [/^microsoft\.compute\//, Server],
  [/^microsoft\.network\//, Network],
  [/^microsoft\.storage\//, HardDrive],
  [/^microsoft\.(sql|dbfor\w+|documentdb|cache|kusto|synapse)\//, Database],
  [/^microsoft\.keyvault\//, KeyRound],
  [/^microsoft\.managedidentity\//, Fingerprint],
  [/^microsoft\.(web|cdn|apimanagement)\//, Globe],
  [/^microsoft\.(insights|operationalinsights|alertsmanagement|monitor)\//, Activity],
  [/^microsoft\.(containerservice|containerregistry|app|containerinstance)\//, Container],
  [/^microsoft\.(eventgrid|eventhub|servicebus|relay|notificationhubs)\//, Radio],
  [/^microsoft\.(logic|datafactory|automation)\//, Workflow],
  [/^microsoft\.(databricks|machinelearningservices|cognitiveservices)\//, Layers],
  [/^microsoft\.(security|authorization|policyinsights)\//, Shield],
  [/^microsoft\.portal\//, AppWindow],
];

export function iconForType(type: string): LucideIcon {
  const t = type.toLowerCase();
  return BY_PROVIDER.find(([re]) => re.test(t))?.[1] ?? Box;
}

type AzureIcons = Record<string, ComponentType<AzureIconProps>>;

// Loaded in parallel with the app; until it arrives (or if it fails) the lucide glyphs are shown.
let azureIcons: AzureIcons | undefined;
const azureListeners = new Set<() => void>();
void import("./azureIcons").then(
  (m) => {
    azureIcons = m.AZURE_ICONS;
    azureListeners.forEach((fn) => fn());
  },
  () => {},
);

function useAzureIcons() {
  return useSyncExternalStore(
    (fn) => {
      azureListeners.add(fn);
      return () => azureListeners.delete(fn);
    },
    () => azureIcons,
  );
}

/**
 * Icon for a resource type: the Azure service icon when we have one (they are drawn on an 18×18
 * grid without a viewBox, so one is added to let them scale), else a lucide glyph by provider.
 */
export function ResourceIcon({ type, className }: { type: string; className?: string }) {
  const Azure = useAzureIcons()?.[type.toLowerCase()];
  if (Azure) return <Azure aria-hidden viewBox="0 0 18 18" className={clsx("shrink-0", className)} />;
  const Fallback = iconForType(type);
  return <Fallback aria-hidden className={clsx("shrink-0 text-muted", className)} />;
}
