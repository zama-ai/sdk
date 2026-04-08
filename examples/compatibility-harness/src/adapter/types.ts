import type { Hex } from "viem";

export type AdapterArchitecture =
  | "EOA"
  | "MPC"
  | "SMART_ACCOUNT"
  | "API_ROUTED_EXECUTION"
  | "UNKNOWN";

export type VerificationModel = "RECOVERABLE_ECDSA" | "ERC1271" | "PROVIDER_MANAGED" | "UNKNOWN";

export type CapabilityName =
  | "addressResolution"
  | "eip712Signing"
  | "recoverableEcdsa"
  | "rawTransactionSigning"
  | "contractExecution"
  | "contractReads"
  | "transactionReceiptTracking"
  | "zamaAuthorizationFlow"
  | "zamaWriteFlow";

export type CapabilityState = "SUPPORTED" | "UNSUPPORTED" | "UNKNOWN";

export type ValidationStatus =
  | "PASS"
  | "FAIL"
  | "UNTESTED"
  | "UNSUPPORTED"
  | "BLOCKED"
  | "INCONCLUSIVE";

export type RootCauseCategory =
  | "ADAPTER"
  | "SIGNER"
  | "RPC"
  | "RELAYER"
  | "REGISTRY"
  | "ENVIRONMENT"
  | "HARNESS";

export interface AdapterMetadata {
  name: string;
  declaredArchitecture?: AdapterArchitecture;
  verificationModel?: VerificationModel;
  supportedChainIds?: number[];
  notes?: string[];
}

export interface AdapterCapabilities {
  addressResolution: CapabilityState;
  eip712Signing: CapabilityState;
  recoverableEcdsa: CapabilityState;
  rawTransactionSigning: CapabilityState;
  contractExecution: CapabilityState;
  contractReads: CapabilityState;
  transactionReceiptTracking: CapabilityState;
  zamaAuthorizationFlow: CapabilityState;
  zamaWriteFlow: CapabilityState;
}

export interface ContractCallConfig {
  address: string;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  gas?: bigint;
}

export interface TransactionReceiptLike {
  status?: string;
}

export interface Adapter {
  metadata: AdapterMetadata;
  capabilities?: Partial<AdapterCapabilities>;
  init?: () => Promise<void>;
  getAddress: () => Promise<string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signTypedData?: (data: any) => Promise<string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signTransaction?: (tx: any) => Promise<string>;
  writeContract?: (config: ContractCallConfig) => Promise<Hex>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readContract?: (config: any) => Promise<unknown>;
  waitForTransactionReceipt?: (hash: Hex) => Promise<TransactionReceiptLike>;
}

export interface LegacySigner {
  address: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signTypedData: (data: any) => Promise<string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signTransaction?: (tx: any) => Promise<string>;
  writeContract?: (config: ContractCallConfig) => Promise<string>;
}

export interface AdapterModuleShape {
  adapter?: Adapter;
  signer?: LegacySigner;
  ready?: Promise<void>;
}

export interface ObservedAdapterProfile {
  name: string;
  source: "adapter" | "legacy-signer";
  declaredArchitecture: AdapterArchitecture;
  detectedArchitecture: AdapterArchitecture;
  verificationModel: VerificationModel;
  address: string;
  declaredCapabilities: AdapterCapabilities;
  observedCapabilities: AdapterCapabilities;
  contradictions: string[];
  initializationStatus: ValidationStatus;
}

export const ALL_CAPABILITIES: CapabilityName[] = [
  "addressResolution",
  "eip712Signing",
  "recoverableEcdsa",
  "rawTransactionSigning",
  "contractExecution",
  "contractReads",
  "transactionReceiptTracking",
  "zamaAuthorizationFlow",
  "zamaWriteFlow",
];

export function emptyCapabilities(): AdapterCapabilities {
  return {
    addressResolution: "UNKNOWN",
    eip712Signing: "UNKNOWN",
    recoverableEcdsa: "UNKNOWN",
    rawTransactionSigning: "UNKNOWN",
    contractExecution: "UNKNOWN",
    contractReads: "UNKNOWN",
    transactionReceiptTracking: "UNKNOWN",
    zamaAuthorizationFlow: "UNKNOWN",
    zamaWriteFlow: "UNKNOWN",
  };
}
