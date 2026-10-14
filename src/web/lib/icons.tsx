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
