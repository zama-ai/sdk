import type { Eip712Like, TypedValue } from "@fhevm/sdk/types";
import type { createFhevmClient, setFhevmRuntimeConfig } from "@fhevm/sdk/viem";
import type { Address, Hex } from "viem";
import type { FheChain } from "../chains/types";

// ============================================================================
// Application Types
//
// zama-sdk's canonical domain shapes. The FHE backend (`FhevmRelayer` + the
// `@fhevm/sdk` engine) translates between these and `@fhevm/sdk`'s API, so the
// rest of the SDK (token, namespaces, credentials, signer) keeps a stable
// surface independent of the underlying FHE library.
// ============================================================================

/**
 * The FHE backend's typed clear-text value (`{ type, value }`) and the
 * `decryptValues` parameter shape, re-exported under the SDK's public surface so
 * downstream packages (the react-sdk, consumers) never import `@fhevm/sdk`
 * directly — the FHE backend stays an internal implementation detail.
 */
export type { TypedValue } from "@fhevm/sdk/types";
export type { DecryptValuesParameters } from "@fhevm/sdk/actions/decrypt";

/** Canonical SDK type for an encrypted value — a `bytes32` ciphertext reference. */
export type EncryptedValue = Hex;

/** Canonical SDK type for a decrypted clear-text value. */
export type ClearValue = TypedValue["value"] | bigint | string | undefined;

/** A single value to encrypt with its FHE type. */
export type EncryptInput =
  | { readonly type: `e${Exclude<TypedValue["type"], "bool" | "address">}`; readonly value: bigint }
  | { readonly type: `e${Extract<TypedValue["type"], "bool">}`; readonly value: boolean | 1n | 0n }
  | { readonly type: `e${Extract<TypedValue["type"], "address">}`; readonly value: Address };

/** Parameters for encryption */
export interface EncryptParams {
  /** Typed inputs for encryption. Each value must specify its FHE type. */
  readonly values: readonly EncryptInput[];
  contractAddress: Address;
  userAddress: Address;
}

/** Result from encryption — contract-ready hex encrypted values and input proof. */
export interface EncryptResult {
  readonly encryptedValues: readonly EncryptedValue[];
  inputProof: Hex;
}

/** Result from public decryption. */
export interface DecryptPublicValuesResult {
  readonly clearValues: Record<EncryptedValue, ClearValue>;
  abiEncodedClearValues: Hex;
  decryptionProof: Hex;
}

/**
 * EIP-712 typed data for a (delegated) user-decrypt permit. Built by the FHE
 * backend and handed to the signer layer (`GenericSigner.signTypedData`), which
 * forwards it to the wallet. A structural shape — the SDK's contract is "sign
 * this typed data", independent of the specific KMS permit variant `@fhevm/sdk`
 * produces (which is versioned and evolves).
 */
export type EIP712TypedData = Eip712Like;

/** The underlying client returned by `@fhevm/sdk`'s `createFhevmClient`. */
export type FhevmClient = ReturnType<typeof createFhevmClient>;

/** Per-client `@fhevm/sdk` options (`batchRpcCalls`, `fheEncryptionKey`). */
export type FhevmClientOptions = NonNullable<Parameters<typeof createFhevmClient>[0]["options"]>;

/**
 * Options for a relayer transport (`web` / `node` / `cleartext`): the per-client
 * {@link FhevmClientOptions} plus a default request `timeout` applied to every
 * relayer round-trip on the chain. A per-call `timeout` overrides this default.
 */
export interface RelayerOptions extends FhevmClientOptions {
  /**
   * Maximum duration, in milliseconds, to wait for a relayer **request** — an
   * input-proof generation or a decryption, including its retry/backoff polling
   * loop, not a single HTTP call. Defaults to the `@fhevm/sdk` ceiling of one
   * hour; set a shorter bound only if you would rather fail than keep waiting. A
   * per-call `timeout` overrides this default.
   *
   * @remarks
   * Bounds only the relayer request, not `@fhevm/sdk`'s one-time (per client)
   * init phase — on-chain protocol-version resolution, the ~50 MB FHE key fetch,
   * and the WASM module load — which runs before the first request and can hang
   * independently of this value. A failed init does not self-recover; discard
   * the client and build a new one to retry.
   *
   * @privateRemarks
   * `@fhevm/sdk`'s `init()` accepts no options, so no timeout/signal reaches
   * that phase, and it memoizes a rejected ready-promise (`??=`). Bounding init
   * is tracked upstream in `@fhevm/sdk`.
   */
  timeout?: number;
}

/**
 * Global `@fhevm/sdk` runtime config — WASM load mode, threads, logger, auth,
 * module versions. Applied once per process (the underlying `setFhevmRuntimeConfig`
 * is one-shot and idempotent; conflicting configs across chains will throw).
 */
export type FhevmRuntimeConfig = Parameters<typeof setFhevmRuntimeConfig>[0];

export interface FhevmRelayerOptions {
  auth: FhevmRuntimeConfig["auth"];
  headers: Record<string, string> | undefined;
  debug: boolean | undefined;
  fetchRetries: number | undefined;
  fetchRetryDelayInMilliseconds: number | undefined;
  signal: AbortSignal | undefined;
  timeout: number | undefined;
}
/**
 * Single-chain FHE backend contract. Implemented by `FhevmRelayer` (drives
 * `@fhevm/sdk`); translates between the domain shapes above and the engine's API.
 */
export interface FhevmRelayerSDK extends Pick<
  FhevmClient,
  | "init"
  | "encryptValue"
  | "encryptValues"
  | "decryptPublicValue"
  | "decryptPublicValues"
  | "decryptPublicValuesWithSignatures"
  | "decryptValue"
  | "decryptValues"
  | "decryptValuesFromPairs"
  | "fetchFheEncryptionKeyBytes"
  | "generateTransportKeyPair"
  | "serializeTransportKeyPair"
  | "serializeSignedDecryptionPermit"
  | "signDecryptionPermit"
  | "parseTransportKeyPair"
  | "parseSignedDecryptionPermit"
> {
  chain: FheChain;
}
