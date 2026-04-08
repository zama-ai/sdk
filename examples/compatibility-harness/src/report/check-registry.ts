import type { ReportSection } from "./schema.js";

export type CanonicalCheckId =
  | "ADAPTER_INITIALIZATION"
  | "ADDRESS_RESOLUTION"
  | "EIP712_SIGNING"
  | "EIP712_RECOVERABILITY"
  | "ERC1271_VERIFICATION"
  | "RAW_TRANSACTION_EXECUTION"
  | "ADAPTER_CONTRACT_READ"
  | "ZAMA_AUTHORIZATION_FLOW"
  | "ZAMA_WRITE_FLOW"
  | "ENVIRONMENT_CONFIGURATION"
  | "RPC_CONNECTIVITY"
  | "RELAYER_REACHABILITY"
  | "REGISTRY_TOKEN_DISCOVERY";

export interface CanonicalCheckDefinition {
  id: CanonicalCheckId;
  name: string;
  section: ReportSection;
  dependencies: CanonicalCheckId[];
  synthetic?: boolean;
}

export const CHECK_REGISTRY: readonly CanonicalCheckDefinition[] = [
  {
    id: "ADAPTER_INITIALIZATION",
    name: "Adapter Initialization",
    section: "adapter",
    dependencies: [],
  },
  {
    id: "ADDRESS_RESOLUTION",
    name: "Address Resolution",
    section: "adapter",
    dependencies: ["ADAPTER_INITIALIZATION"],
  },
  {
    id: "EIP712_SIGNING",
    name: "EIP-712 Signing",
    section: "ethereum",
    dependencies: ["ADAPTER_INITIALIZATION"],
  },
  {
    id: "EIP712_RECOVERABILITY",
    name: "EIP-712 Recoverability",
    section: "ethereum",
    dependencies: ["EIP712_SIGNING"],
  },
  {
    id: "ERC1271_VERIFICATION",
    name: "ERC-1271 Verification",
    section: "ethereum",
    dependencies: ["EIP712_SIGNING"],
  },
  {
    id: "RAW_TRANSACTION_EXECUTION",
    name: "Raw Transaction Execution",
    section: "ethereum",
    dependencies: ["ADAPTER_INITIALIZATION", "ADDRESS_RESOLUTION"],
  },
  {
    id: "ADAPTER_CONTRACT_READ",
    name: "Adapter Contract Read",
    section: "execution",
    dependencies: ["ADAPTER_INITIALIZATION"],
  },
  {
    id: "ZAMA_AUTHORIZATION_FLOW",
    name: "Zama Authorization Flow",
    section: "zama",
    dependencies: ["ADAPTER_INITIALIZATION", "EIP712_SIGNING"],
  },
  {
    id: "ZAMA_WRITE_FLOW",
    name: "Zama Write Flow",
    section: "zama",
    dependencies: ["ADAPTER_INITIALIZATION"],
  },
  {
    id: "ENVIRONMENT_CONFIGURATION",
    name: "Environment Configuration",
    section: "environment",
    dependencies: [],
    synthetic: true,
  },
  {
    id: "RPC_CONNECTIVITY",
    name: "RPC Connectivity",
    section: "environment",
    dependencies: [],
    synthetic: true,
  },
  {
    id: "RELAYER_REACHABILITY",
    name: "Relayer Reachability",
    section: "environment",
    dependencies: [],
    synthetic: true,
  },
  {
    id: "REGISTRY_TOKEN_DISCOVERY",
    name: "Registry / Token Discovery",
    section: "environment",
    dependencies: [],
    synthetic: true,
  },
] as const;

const CHECK_BY_ID = new Map<CanonicalCheckId, CanonicalCheckDefinition>(
  CHECK_REGISTRY.map((check) => [check.id, check]),
);

const CHECK_BY_NAME = new Map<string, CanonicalCheckDefinition>(
  CHECK_REGISTRY.map((check) => [check.name, check]),
);

export function getCanonicalCheckById(id: CanonicalCheckId): CanonicalCheckDefinition {
  return CHECK_BY_ID.get(id)!;
}

export function getCanonicalCheckByName(name: string): CanonicalCheckDefinition | undefined {
  return CHECK_BY_NAME.get(name);
}

export function isCanonicalCheckId(value: string): value is CanonicalCheckId {
  return CHECK_BY_ID.has(value as CanonicalCheckId);
}

export function checkOrder(id: CanonicalCheckId): number {
  const index = CHECK_REGISTRY.findIndex((check) => check.id === id);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export interface CheckLike {
  checkId: CanonicalCheckId;
  name: string;
  section: ReportSection;
}

export function assertCanonicalCheck(check: CheckLike): void {
  const expected = CHECK_BY_ID.get(check.checkId);
  if (!expected) {
    throw new Error(`Unknown checkId "${check.checkId}" in recorded result.`);
  }
  if (check.name !== expected.name) {
    throw new Error(
      `Invalid check name for ${check.checkId}: expected "${expected.name}", got "${check.name}".`,
    );
  }
  if (check.section !== expected.section) {
    throw new Error(
      `Invalid check section for ${check.checkId}: expected "${expected.section}", got "${check.section}".`,
    );
  }
}
