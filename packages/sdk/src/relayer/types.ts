import type { Eip712Like, TypedValue } from "@fhevm/sdk/types";
import type {
  createFhevmBaseClient,
  createFhevmClient,
  createFhevmDecryptClient,
  createFhevmEncryptClient,
  setFhevmRuntimeConfig,
} from "@fhevm/sdk/viem";
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

/** @internal Capability-scoped `@fhevm/sdk` clients used by {@link FhevmRelayer}. */
export type FhevmBaseClient = ReturnType<typeof createFhevmBaseClient>;
/** @internal */
export type FhevmDecryptClient = ReturnType<typeof createFhevmDecryptClient>;
/** @internal */
export type FhevmEncryptClient = ReturnType<typeof createFhevmEncryptClient>;

/** Per-client `@fhevm/sdk` options (`batchRpcCalls`, `fheEncryptionKey`). */
export type FhevmClientOptions = NonNullable<Parameters<typeof createFhevmClient>[0]["options"]>;

/**
 * Options for a relayer transport (`web` / `node` / `cleartext`): the per-client
 * `@fhevm/sdk` options that shape the underlying client, plus the request
 * defaults `timeout` and `debug` applied to every relayer round-trip on the
 * chain. A per-call `timeout`/`debug` overrides these defaults.
 *
 * @remarks
 * The three client options mirror {@link FhevmClientOptions} but are listed
 * explicitly so each carries its own documentation; `timeout` and `debug` are
 * picked from {@link FhevmRelayerOptions}, the per-request option set.
 */
export interface RelayerOptions extends Pick<FhevmRelayerOptions, "timeout" | "debug"> {
  /**
   * Batch the client's JSON-RPC reads (the on-chain calls it makes to resolve
   * the protocol and key versions) into a single request instead of issuing
   * them one by one.
   *
   * @defaultValue `false`
   */
  readonly batchRpcCalls?: boolean;
  /**
   * A pre-fetched FHE public encryption key. Supply it to skip the ~50 MB key
   * fetch `@fhevm/sdk` otherwise performs during init — e.g. to reuse a key
   * cached across clients or sessions.
   *
   * @defaultValue none — the key is fetched from the relayer's `keyurl`.
   */
  readonly fheEncryptionKey?: FhevmClientOptions["fheEncryptionKey"];
  /**
   * Pins the TFHE/KMS WASM module versions instead of auto-resolving them from
   * the chain's on-chain protocol version.
   *
   * @defaultValue `'auto'`
   */
  readonly moduleVersions?: FhevmClientOptions["moduleVersions"];
}

/**
 * Global `@fhevm/sdk` runtime config — WASM load mode, threads, logger, auth,
 * module versions. Applied once per process (the underlying `setFhevmRuntimeConfig`
 * is one-shot and idempotent; conflicting configs across chains will throw).
 */
export type FhevmRuntimeConfig = Parameters<typeof setFhevmRuntimeConfig>[0];

/**
 * The full set of per-request options `@fhevm/sdk`'s relayer accepts on every
 * round-trip (mirrors its `RelayerCommonOptions`). Distinct from
 * {@link RelayerOptions}, which configures a transport once at construction —
 * these are applied per call.
 *
 */
export interface FhevmRelayerOptions {
  /** Relayer authentication for the chain. Defaulted from the chain's config. */
  readonly auth?: FhevmRuntimeConfig["auth"];
  /** Extra HTTP headers attached to each relayer request. */
  readonly headers?: Record<string, string>;
  /**
   * When `true`, `@fhevm/sdk`'s relayer emits verbose per-request trace logs to
   * `console.log` (`[RelayerAsyncRequest]:…`), following each round-trip through
   * its polling/retry loop. Off by default. A per-call `debug` overrides this.
   *
   * @remarks
   * This is a raw diagnostic switch on the FHE backend, separate from the SDK's
   * own configurable logger ({@link GenericLogger} via `createConfig`): it always
   * writes to `console`, regardless of any logger you pass. Use it for one-off
   * troubleshooting of relayer round-trips, not as a production logging channel.
   *
   * @defaultValue `false` `@fhevm/sdk` treats a missing flag as off.
   */
  readonly debug?: boolean;
  /**
   * Times a failed HTTP fetch is retried on transient errors before the request
   * gives up. This is the low-level fetch retry, separate from the async-job
   * polling loop that waits on a queued relayer request.
   *
   * @defaultValue `3` `@fhevm/sdk`'s `FETCH_RETRY`.
   */
  readonly fetchRetries?: number;
  /**
   * Delay between those fetch retries, in milliseconds.
   *
   * @defaultValue `1_000` `@fhevm/sdk`'s `FETCH_RETRY_AFTER_MS`;
   */
  readonly fetchRetryDelayInMilliseconds?: number;
  /**
   * Cancels the request (and its retry/backoff loop) when aborted.
   *
   * @defaultValue none — the SDK injects no signal, so a request is uncancellable
   * unless a per-call `signal` is passed.
   */
  readonly signal?: AbortSignal;
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
   * @defaultValue `3_600_000` (1 hour) — `@fhevm/sdk`'s
   * `DEFAULT_GLOBAL_REQUEST_TIMEOUT_MS`, applied when no `timeout` is set at
   * construction or per call.
   *
   * @privateRemarks
   * `@fhevm/sdk`'s `init()` accepts no options, so no timeout/signal reaches
   * that phase, and it memoizes a rejected ready-promise (`??=`). Bounding init
   * is tracked upstream in `@fhevm/sdk`.
   */
  readonly timeout?: number;
}
/**
 * Single-chain FHE backend contract. Implemented by `FhevmRelayer` (drives
 * `@fhevm/sdk`); translates between the domain shapes above and the engine's API.
 */
export interface FhevmRelayerSDK extends Pick<
  FhevmClient,
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
