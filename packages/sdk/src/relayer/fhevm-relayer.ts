import { createFhevmClient } from "@fhevm/sdk/viem";
import { createFhevmCleartextClient } from "@fhevm/sdk/viem/cleartext";
import { createPublicClient, custom, http } from "viem";
import { toFhevmChain } from "../chains/to-fhevm-chain";
import type { FheChain } from "../chains/types";
import type { FhevmClient, FhevmRelayerOptions, FhevmRelayerSDK, RelayerOptions } from "./types";

/** Construction config for {@link FhevmRelayer}. */
export interface FhevmRelayerConfig {
  /** FHE chain configuration. */
  chain: FheChain;
  /**
   * Cleartext mode for local dev/test chains without FHE infrastructure — reads
   * mock cleartexts from the on-chain executor (discovered automatically)
   * instead of calling the relayer.
   */
  cleartext?: boolean;
  /**
   * Per-transport {@link RelayerOptions}: `@fhevm/sdk` client options plus a
   * default request `timeout` applied to every relayer round-trip on the chain.
   */
  options?: RelayerOptions;
}

/**
 * Single-chain FHE backend that drives `@fhevm/sdk` on the calling thread.
 * EIP-712 signing is done by the signer layer; this backend builds the typed
 * data and, on decrypt, reassembles the new SDK's signed permit from the
 * interface's params + the previously returned signature.
 *
 * @remarks
 * Each method delegates to the underlying {@link FhevmClient}, adding two
 * cross-cutting behaviors that the delegated signatures don't express:
 *
 * - **Lazy init.** Every network method awaits {@link FhevmRelayer.init} before
 *   delegating, so callers never init the client themselves. `init()` is
 *   idempotent — the client memoizes its ready-promise — so the repeated awaits
 *   collapse to a single init per client.
 * - **Option merging.** The chain's default options (`auth`, `timeout`, `debug`)
 *   are spread in first, then the per-call `options`, so a per-call value always
 *   wins over the chain default. The passthrough methods (serialize/parse and
 *   key-pair helpers) make no relayer round-trip, so they inject no options.
 */
export class FhevmRelayer implements FhevmRelayerSDK {
  readonly #chain: FheChain;
  readonly #fhevm: FhevmClient;
  readonly #defaultOptions: Partial<FhevmRelayerOptions>;

  /**
   * Builds the `@fhevm/sdk` client for the chain — a cleartext client in
   * {@link FhevmRelayerConfig.cleartext} mode, otherwise the real relayer
   * client — and captures the chain's `auth`/`timeout`/`debug` as the default
   * options merged into every network call. Construction is cheap; the client's
   * one-time init is deferred to the first network call (see {@link init}).
   */
  constructor(config: FhevmRelayerConfig) {
    this.#chain = config.chain;
    const { timeout, debug, batchRpcCalls, moduleVersions, fheEncryptionKey } =
      config.options ?? {};
    const params = {
      publicClient: createPublicClient({
        transport:
          typeof this.#chain.network === "string"
            ? http(this.#chain.network)
            : custom(this.#chain.network),
      }),
      chain: toFhevmChain(this.#chain),
      options: { batchRpcCalls, moduleVersions, fheEncryptionKey },
    };
    this.#fhevm = config.cleartext ? createFhevmCleartextClient(params) : createFhevmClient(params);
    this.#defaultOptions = { auth: this.#chain.auth, timeout, debug };
  }

  /** The FHE chain this backend is bound to. */
  get chain() {
    return this.#chain;
  }

  /**
   * Runs the client's one-time init — on-chain protocol-version resolution, the
   * FHE key fetch, and the WASM module load — and memoizes the result. Every
   * network method awaits this first, so calling it directly is optional. Safe
   * to call repeatedly; a settled init returns immediately.
   *
   * @remarks
   * A failed init does not self-recover: the underlying client memoizes the
   * rejected ready-promise. Discard this backend and build a new one to retry.
   */
  init: FhevmClient["init"] = async () => this.#fhevm.init();

  /**
   * Decrypts a single publicly-decryptable value — one whose contract granted
   * public access, so no permit or key pair is needed — into its typed clear
   * value.
   *
   * @example
   * ```ts
   * const { type, value } = await relayer.decryptPublicValue({
   *   encryptedValue: handle, // a bytes32 ciphertext reference
   * });
   * ```
   */
  decryptPublicValue: FhevmClient["decryptPublicValue"] = async (parameters) => {
    await this.init();
    return this.#fhevm.decryptPublicValue({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  /**
   * Batch form of {@link decryptPublicValue}: decrypts many publicly-decryptable
   * values in one relayer round-trip, returning their typed clear values in
   * order.
   *
   * @example
   * ```ts
   * const values = await relayer.decryptPublicValues({
   *   encryptedValues: [handleA, handleB],
   * });
   * ```
   */
  decryptPublicValues: FhevmClient["decryptPublicValues"] = async (parameters) => {
    await this.init();
    return this.#fhevm.decryptPublicValues({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  /**
   * Like {@link decryptPublicValues}, but also returns the KMS signature bundle —
   * the handles list, ABI-encoded cleartexts, and decryption proof — needed to
   * verify or replay the result on-chain.
   *
   * @example
   * ```ts
   * const { clearValues, checkSignaturesArgs } =
   *   await relayer.decryptPublicValuesWithSignatures({ encryptedValues: [handle] });
   * // checkSignaturesArgs: { handlesList, abiEncodedCleartexts, decryptionProof }
   * ```
   */
  decryptPublicValuesWithSignatures: FhevmClient["decryptPublicValuesWithSignatures"] = async (
    parameters,
  ) => {
    await this.init();
    return this.#fhevm.decryptPublicValuesWithSignatures({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  encryptValue: FhevmClient["encryptValue"] = async (parameters) => {
    await this.init();
    return this.#fhevm.encryptValue({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  encryptValues: FhevmClient["encryptValues"] = async (parameters) => {
    await this.init();
    return this.#fhevm.encryptValues({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  decryptValue: FhevmClient["decryptValue"] = async (parameters) => {
    await this.init();
    return this.#fhevm.decryptValue({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  decryptValues: FhevmClient["decryptValues"] = async (parameters) => {
    await this.init();
    return this.#fhevm.decryptValues({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  decryptValuesFromPairs: FhevmClient["decryptValuesFromPairs"] = async (parameters) => {
    await this.init();
    return this.#fhevm.decryptValuesFromPairs({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  fetchFheEncryptionKeyBytes: FhevmClient["fetchFheEncryptionKeyBytes"] = async (parameters) => {
    await this.init();
    return this.#fhevm.fetchFheEncryptionKeyBytes({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters?.options },
    });
  };

  signDecryptionPermit: FhevmClient["signDecryptionPermit"] = async (parameters) => {
    await this.init();
    return this.#fhevm.signDecryptionPermit(parameters);
  };

  // Non-network passthroughs — no relayer round-trip, so no `auth` to inject.

  serializeTransportKeyPair: FhevmClient["serializeTransportKeyPair"] = (parameters) =>
    this.#fhevm.serializeTransportKeyPair(parameters);

  serializeSignedDecryptionPermit: FhevmClient["serializeSignedDecryptionPermit"] = (parameters) =>
    this.#fhevm.serializeSignedDecryptionPermit(parameters);

  parseTransportKeyPair: FhevmClient["parseTransportKeyPair"] = (parameters) =>
    this.#fhevm.parseTransportKeyPair(parameters);

  parseSignedDecryptionPermit: FhevmClient["parseSignedDecryptionPermit"] = (parameters) =>
    this.#fhevm.parseSignedDecryptionPermit(parameters);

  generateTransportKeyPair: FhevmClient["generateTransportKeyPair"] = async () => {
    await this.init();
    return this.#fhevm.generateTransportKeyPair();
  };
}
