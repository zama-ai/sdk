import type * as SDK from "@zama-fhe/relayer-sdk/bundle";
import type { Address } from "@zama-fhe/relayer-sdk/bundle";

// ============================================================================
// SDK Types (local definitions to avoid importing from @zama-fhe/relayer-sdk/web)
// These mirror the SDK types but avoid bundler processing of WASM files
// ============================================================================

/** Global SDK interface (from CDN script window.relayerSDK) */
export interface RelayerSDKGlobal {
  initSDK: typeof SDK.initSDK;
  createInstance: typeof SDK.createInstance;
  SepoliaConfig: SDK.FhevmInstanceConfig;
  MainnetConfig: SDK.FhevmInstanceConfig;
}

// ============================================================================
// Application Types
// ============================================================================

/** Network configuration for the Relayer SDK */
export type NetworkType = "hardhat" | "sepolia" | "mainnet";

/** Configuration for RelayerWeb (browser backend) initialization. */
export interface RelayerWebConfig {
  transports: Record<number, Partial<SDK.FhevmInstanceConfig>>;
  /** Resolve the current chain ID. Called lazily before each operation; the worker is re-initialized when the value changes. */
  getChainId: () => Promise<number>;
  /** Resolve the current CSRF token. Called before each authenticated network request. */
  getCsrfToken?: () => string;
}

/** Result from encryption operation */
export interface EncryptResult {
  handles: Uint8Array[];
  inputProof: Uint8Array;
}

/** Parameters for encryption */
export interface EncryptParams {
  values: bigint[];
  contractAddress: Address;
  userAddress: Address;
}

/** Parameters for user decryption */
export interface UserDecryptParams {
  handles: string[];
  contractAddress: Address;
  signedContractAddresses: Address[];
  privateKey: string;
  publicKey: string;
  signature: string;
  signerAddress: Address;
  startTimestamp: number;
  durationDays: number;
}

/** Result from public decryption */
export interface PublicDecryptResult {
  clearValues: Record<string, bigint>;
  abiEncodedClearValues: string;
  decryptionProof: Address;
}

/** Keypair for FHE operations */
export interface FHEKeypair {
  publicKey: string;
  privateKey: string;
}

/** EIP712 typed data structure */
export interface EIP712TypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  types: {
    [key: string]: Array<{
      name: string;
      type: string;
    }>;
  };
  message: {
    publicKey: string;
    contractAddresses: string[];
    startTimestamp: bigint;
    durationDays: bigint;
    extraData: string;
  };
}

/** Parameters for delegated user decryption */
export interface DelegatedUserDecryptParams {
  handles: string[];
  contractAddress: Address;
  signedContractAddresses: Address[];
  privateKey: string;
  publicKey: string;
  signature: string;
  delegatorAddress: Address;
  delegateAddress: Address;
  startTimestamp: number;
  durationDays: number;
}

/** SDK status */
export type RelayerSDKStatus = "idle" | "initializing" | "ready" | "error";

export type * from "@zama-fhe/relayer-sdk/bundle";
