import type * as SDK from "@zama-fhe/relayer-sdk/bundle";

export type Hex = `0x${string}`;

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
  chainId: number;
  transports: Record<number, Partial<SDK.FhevmInstanceConfig>>;
  csrfToken?: string | (() => string);
}

/** Result from encryption operation */
export interface EncryptResult {
  handles: Uint8Array[];
  inputProof: Uint8Array;
}

/** Parameters for encryption */
export interface EncryptParams {
  values: bigint[];
  contractAddress: Hex;
  userAddress: Hex;
}

/** Parameters for user decryption */
export interface UserDecryptParams {
  handles: string[];
  contractAddress: Hex;
  signedContractAddresses: Hex[];
  privateKey: string;
  publicKey: string;
  signature: string;
  signerAddress: Hex;
  startTimestamp: number;
  durationDays: number;
}

/** Result from public decryption */
export interface PublicDecryptResult {
  clearValues: Record<string, bigint>;
  abiEncodedClearValues: string;
  decryptionProof: Hex;
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
    verifyingContract: Hex;
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
  contractAddress: Hex;
  signedContractAddresses: Hex[];
  privateKey: string;
  publicKey: string;
  signature: string;
  delegatorAddress: Hex;
  delegateAddress: Hex;
  startTimestamp: number;
  durationDays: number;
}

/** SDK status */
export type RelayerSDKStatus = "idle" | "initializing" | "ready" | "error";

export type * from "@zama-fhe/relayer-sdk/bundle";
