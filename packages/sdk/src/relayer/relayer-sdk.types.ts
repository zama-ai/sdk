import type * as SDK from "@zama-fhe/relayer-sdk/bundle";
import type { Address } from "@zama-fhe/relayer-sdk/bundle";
import type { GenericLogger } from "../worker/worker.types";

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

/** Generic hex-encoded string (signatures, tx hashes, proofs, etc.). */
export type Hex = `0x${string}`;

// ============================================================================
// Application Types
// ============================================================================

/** Network configuration for the Relayer SDK */
export type NetworkType = "hardhat" | "sepolia" | "mainnet";

/** Security options for RelayerWeb. */
export interface RelayerWebSecurityConfig {
  /** Resolve the current CSRF token. Called before each authenticated network request. */
  getCsrfToken?: () => string;
  /** Verify SHA-384 integrity of the CDN bundle. Defaults to `true`. Set to `false` only in test environments with mocked SDK scripts. */
  integrityCheck?: boolean;
}

/** Configuration for RelayerWeb (browser backend) initialization. */
export interface RelayerWebConfig {
  transports: Record<number, Partial<SDK.FhevmInstanceConfig>>;
  /** Resolve the current chain ID. Called lazily before each operation; the worker is re-initialized when the value changes. */
  getChainId: () => Promise<number>;
  /** Security options (CSRF, CDN integrity). */
  security?: RelayerWebSecurityConfig;
  /** Optional logger for observing worker lifecycle and request timing. */
  logger?: GenericLogger;
  /**
   * Number of WASM threads for parallel FHE operations inside the Web Worker.
   * Uses `wasm-bindgen-rayon` under the hood via `SharedArrayBuffer`.
   *
   * **Requirements:** The page must be served with COOP/COEP headers:
   * - `Cross-Origin-Opener-Policy: same-origin`
   * - `Cross-Origin-Embedder-Policy: require-corp`
   *
   * 4–8 threads is the practical sweet spot; beyond that, diminishing returns
   * and higher memory usage on low-end devices.
   *
   * When omitted, the relayer SDK uses its default (single-threaded).
   */
  threads?: number;
  /** Called whenever the SDK status changes (e.g. idle → initializing → ready). */
  onStatusChange?: (status: RelayerSDKStatus, error?: Error) => void;
}

/** Result from encryption operation */
export interface EncryptResult {
  handles: Uint8Array[];
  inputProof: Uint8Array;
}

/** Supported FHE encrypted types. */
export type FheType =
  | "ebool"
  | "euint4"
  | "euint8"
  | "euint16"
  | "euint32"
  | "euint64"
  | "euint128"
  | "euint256"
  | "eaddress";

/** A single value to encrypt with its FHE type. */
export interface EncryptInput {
  value: bigint | boolean;
  type: FheType;
}

/** Parameters for encryption */
export interface EncryptParams {
  /** Typed inputs for encryption. Each value must specify its FHE type. */
  values: EncryptInput[];
  contractAddress: Address;
  userAddress: Address;
}

/**
 * Union of possible decrypted value types.
 * - bigint for euintN types
 * - boolean for ebool
 * - hex string for eaddress
 */
export type DecryptedValue = bigint | boolean | `0x${string}`;

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
  primaryType?: string;
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
