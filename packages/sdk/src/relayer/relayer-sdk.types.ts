import type { Address, Hex } from "viem";
import type { FhevmInstanceConfig, GenericLogger } from "../worker/worker.types";
import type { GenericStorage } from "../types";
import type { StoredEIP712 } from "../types/credentials";

// ============================================================================
// Application Types
// ============================================================================

/** Network configuration for the Relayer SDK */
export type NetworkType = "hardhat" | "sepolia" | "mainnet";

/** Security options for RelayerWeb. */
export interface RelayerWebSecurityConfig {
  /** Resolve the current CSRF token. Called before each authenticated network request. */
  getCsrfToken?: () => string;
}

/** Configuration for RelayerWeb (browser backend) initialization. */
export interface RelayerWebConfig {
  transports: Record<number, Partial<FhevmInstanceConfig>>;
  /** Resolve the current chain ID. Called lazily before each operation; the worker is re-initialized when the value changes. */
  getChainId: () => Promise<number>;
  /** Security options (CSRF). */
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
  /**
   * Persistent storage for caching FHE public key and params across sessions.
   *
   * Defaults to `new IndexedDBStorage("FheArtifactCache", 1, "artifacts")`.
   * Pass a custom `IndexedDBStorage` instance to configure the database name,
   * version, or store name. FHE public params can be several MB — avoid
   * `localStorage`-backed storage which caps at ~5 MB.
   *
   * **Not to be confused with `ZamaProvider.storage`** which stores credentials.
   */
  fheArtifactStorage?: GenericStorage;
  /** Cache TTL in seconds for FHE public material. Default: 86 400 (24 h). Set to 0 to revalidate on every operation. Ignored when storage is not set. */
  fheArtifactCacheTTL?: number;
}

/** Result from encryption operation. */
export interface EncryptResult {
  handles: Uint8Array[];
  inputProof: Uint8Array;
}

/** Canonical SDK type for encrypted ciphertext handles (`bytes32` values). */
export type Handle = `0x${string}`;

/** Decrypted value type returned by FHE operations. Includes `number` for the SDK's branded uint8/16/32 types. */
export type ClearValueType = number | bigint | boolean | `0x${string}`;

/** FHE type names for encryption. */
export type FheTypeName =
  | "ebool"
  | "euint8"
  | "euint16"
  | "euint32"
  | "euint64"
  | "euint128"
  | "euint256"
  | "eaddress";

/** A single value to encrypt with its FHE type. */
export type EncryptInput =
  | {
      value: boolean | bigint;
      type: "ebool";
    }
  | {
      value: bigint;
      type: Exclude<FheTypeName, "ebool" | "eaddress">;
    }
  | {
      value: Address;
      type: "eaddress";
    };

/** Parameters for encryption */
export interface EncryptParams {
  /** Typed inputs for encryption. Each value must specify its FHE type. */
  values: EncryptInput[];
  contractAddress: Address;
  userAddress: Address;
}

/** Parameters for user decryption */
export interface UserDecryptParams {
  handles: Handle[];
  contractAddress: Address;
  signedContractAddresses: Address[];
  privateKey: Hex;
  publicKey: Hex;
  signature: Hex;
  signerAddress: Address;
  startTimestamp: number;
  durationDays: number;
  eip712: StoredEIP712;
}

/** Result from public decryption. */
export interface PublicDecryptResult {
  clearValues: Readonly<Record<Handle, ClearValueType>>;
  abiEncodedClearValues: Hex;
  decryptionProof: Hex;
}

/**
 * EIP712 typed data structure for user or delegated user decrypt requests.
 */
export type EIP712TypedData = {
  readonly domain: {
    readonly name: string;
    readonly version: string;
    readonly chainId: bigint;
    readonly verifyingContract: `0x${string}`;
  };
  readonly types: Record<string, readonly { readonly name: string; readonly type: string }[]>;
  readonly primaryType: string;
  readonly message: Record<string, unknown>;
};

/** TFHE public key */
export interface PublicKeyData {
  publicKeyId: string;
  publicKey: Uint8Array;
}

/** TFHE public parameters for a given bit size. */
export interface PublicParamsData {
  publicParams: Uint8Array;
  publicParamsId: string;
}

/** Parameters for delegated user decryption */
export interface DelegatedUserDecryptParams {
  handles: Handle[];
  contractAddress: Address;
  signedContractAddresses: Address[];
  privateKey: Hex;
  publicKey: Hex;
  signature: Hex;
  delegatorAddress: Address;
  delegateAddress: Address;
  startTimestamp: number;
  durationDays: number;
  eip712: StoredEIP712;
}

/** SDK status */
export type RelayerSDKStatus = "idle" | "initializing" | "ready" | "error";

export type { FhevmInstanceConfig };
