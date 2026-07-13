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
 *   idempotent — it memoizes its ready-promise — so the repeated awaits
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
  #initPromise: Promise<void> | undefined;

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
    this.#defaultOptions = {
      ...(this.#chain.auth !== undefined && { auth: this.#chain.auth }),
      ...(timeout !== undefined && { timeout }),
      ...(debug !== undefined && { debug }),
    };
  }

  /** The FHE chain this backend is bound to. */
  get chain() {
    return this.#chain;
  }

  /**
   * Runs the client's one-time init and memoizes the combined attempt. Two
   * steps in order: first prefetch the chain's FHE encryption key with the
   * default options — the only path that carries the chain's `auth`, so the
   * key fetch reaches an authenticated relayer — then delegate to the client's
   * own init (on-chain protocol-version resolution and the WASM module load).
   * Every network method awaits this first, so calling it directly is optional.
   * Safe to call repeatedly; concurrent and post-settlement calls share the one
   * memoized promise.
   *
   * @remarks
   * A failed init does not self-recover: the rejected promise stays memoized in
   * `#initPromise`. Discard this backend and build a new one to retry.
   */
  init: FhevmClient["init"] = () => {
    this.#initPromise ??= this.#fhevm
      .fetchFheEncryptionKeyBytes({ options: this.#defaultOptions })
      .then(() => this.#fhevm.init());
    return this.#initPromise;
  };

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

  /**
   * Encrypts one typed input under the chain's FHE key, bound to the contract it
   * targets and the user submitting it, and returns the ciphertext handle plus
   * the input proof the contract verifies on-chain. `type` is the raw FHE type
   * without the `e` prefix (`"uint64"`, `"bool"`, `"address"`).
   *
   * @example
   * ```ts
   * const { encryptedValue, inputProof } = await relayer.encryptValue({
   *   value: { type: "uint64", value: 1000n },
   *   contractAddress: "0xToken…",
   *   userAddress: "0xUser…",
   * });
   * ```
   */
  encryptValue: FhevmClient["encryptValue"] = async (parameters) => {
    await this.init();
    return this.#fhevm.encryptValue({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  /**
   * Batch form of {@link encryptValue}: encrypts several inputs for the same
   * contract and user in one call, returning all ciphertext handles under a
   * single shared input proof.
   *
   * @example
   * ```ts
   * const { encryptedValues, inputProof } = await relayer.encryptValues({
   *   values: [
   *     { type: "uint64", value: 1000n },
   *     { type: "bool", value: true },
   *   ],
   *   contractAddress: "0xToken…",
   *   userAddress: "0xUser…",
   * });
   * ```
   */
  encryptValues: FhevmClient["encryptValues"] = async (parameters) => {
    await this.init();
    return this.#fhevm.encryptValues({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  /**
   * User-decrypts a single access-controlled value: the relayer re-encrypts it
   * to the ephemeral transport key pair, gated by the signed permit, and this
   * returns the typed clear value. Build the key pair with
   * {@link generateTransportKeyPair} and the permit with
   * {@link signDecryptionPermit}.
   *
   * @example
   * ```ts
   * const { type, value } = await relayer.decryptValue({
   *   encryptedValue: handle,
   *   contractAddress: "0xToken…",
   *   transportKeyPair,
   *   signedPermit,
   * });
   * ```
   */
  decryptValue: FhevmClient["decryptValue"] = async (parameters) => {
    await this.init();
    return this.#fhevm.decryptValue({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  /**
   * Batch form of {@link decryptValue} for values that all belong to the same
   * contract; returns the typed clear values positionally. For values spanning
   * multiple contracts, use {@link decryptValuesFromPairs}.
   *
   * @example
   * ```ts
   * const values = await relayer.decryptValues({
   *   encryptedValues: [handleA, handleB],
   *   contractAddress: "0xToken…",
   *   transportKeyPair,
   *   signedPermit,
   * });
   * ```
   */
  decryptValues: FhevmClient["decryptValues"] = async (parameters) => {
    await this.init();
    return this.#fhevm.decryptValues({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  /**
   * User-decrypts values that span multiple contracts: each pair carries its own
   * `contractAddress`, so one permit covering those contracts decrypts them all
   * in a single round-trip. Returns the typed clear values positionally.
   *
   * @example
   * ```ts
   * const values = await relayer.decryptValuesFromPairs({
   *   pairs: [
   *     { encryptedValue: handleA, contractAddress: "0xTokenA…" },
   *     { encryptedValue: handleB, contractAddress: "0xTokenB…" },
   *   ],
   *   transportKeyPair,
   *   signedPermit,
   * });
   * ```
   */
  decryptValuesFromPairs: FhevmClient["decryptValuesFromPairs"] = async (parameters) => {
    await this.init();
    return this.#fhevm.decryptValuesFromPairs({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  /**
   * Fetches the chain's raw FHE public-key bytes — the key encryption uses —
   * served from cache unless `ignoreCache` forces a refetch. Rarely called
   * directly: {@link encryptValue}/{@link encryptValues} fetch the key for you.
   *
   * @example
   * ```ts
   * const keyBytes = await relayer.fetchFheEncryptionKeyBytes();
   * const fresh = await relayer.fetchFheEncryptionKeyBytes({ ignoreCache: true });
   * ```
   */
  fetchFheEncryptionKeyBytes: FhevmClient["fetchFheEncryptionKeyBytes"] = async (parameters) => {
    await this.init();
    return this.#fhevm.fetchFheEncryptionKeyBytes({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters?.options },
    });
  };

  /**
   * Builds the EIP-712 user-decrypt permit and signs it with the given signer,
   * authorizing the transport key pair to decrypt the listed contracts' values
   * for `durationSeconds` starting at `startTimestamp`. Pass `delegatorAddress`
   * to sign a delegated permit — decrypting values owned by that account instead
   * of the signer's own. Persist the result via
   * {@link serializeSignedDecryptionPermit}.
   *
   * @example
   * ```ts
   * const signedPermit = await relayer.signDecryptionPermit({
   *   transportKeyPair,
   *   contractAddresses: ["0xToken…"],
   *   startTimestamp: Math.floor(Date.now() / 1000),
   *   durationSeconds: 60 * 60 * 24,
   *   signerAddress: "0xUser…",
   *   signer,
   *   // delegatorAddress: "0xOwner…", // omit for a self permit
   * });
   * ```
   */
  signDecryptionPermit: FhevmClient["signDecryptionPermit"] = async (parameters) => {
    await this.init();
    return this.#fhevm.signDecryptionPermit(parameters);
  };

  // Non-network passthroughs — no relayer round-trip, so no `auth` to inject.

  /**
   * Serializes a transport key pair to a hex `{ publicKey, privateKey }` pair for
   * storage or transport, so a decryption session can resume without regenerating
   * keys. Reverse of {@link parseTransportKeyPair}. Purely local — no round-trip.
   *
   * @example
   * ```ts
   * const stored = relayer.serializeTransportKeyPair({ transportKeyPair });
   * // { publicKey: "0x…", privateKey: "0x…" }
   * ```
   */
  serializeTransportKeyPair: FhevmClient["serializeTransportKeyPair"] = (parameters) =>
    this.#fhevm.serializeTransportKeyPair(parameters);

  /**
   * Serializes a signed permit to a plain, JSON-stringifiable object (version,
   * EIP-712 payload, signature, signer) for caching or transport. Reverse of
   * {@link parseSignedDecryptionPermit}. Purely local — no round-trip.
   *
   * @example
   * ```ts
   * const serialized = relayer.serializeSignedDecryptionPermit({ signedPermit });
   * localStorage.setItem("permit", JSON.stringify(serialized));
   * ```
   */
  serializeSignedDecryptionPermit: FhevmClient["serializeSignedDecryptionPermit"] = (parameters) =>
    this.#fhevm.serializeSignedDecryptionPermit(parameters);

  /**
   * Rebuilds a transport key pair from its serialized hex
   * `{ publicKey, privateKey }` form. Reverse of {@link serializeTransportKeyPair}.
   *
   * @example
   * ```ts
   * const transportKeyPair = await relayer.parseTransportKeyPair({
   *   publicKey: stored.publicKey,
   *   privateKey: stored.privateKey,
   * });
   * ```
   */
  parseTransportKeyPair: FhevmClient["parseTransportKeyPair"] = (parameters) =>
    this.#fhevm.parseTransportKeyPair(parameters);

  /**
   * Rebuilds a signed permit from its serialized form and validates it: checks
   * the EIP-712 structure, verifies the signature against the on-chain verifier,
   * and confirms the permit's public key matches `transportKeyPair`. Reverse of
   * {@link serializeSignedDecryptionPermit}.
   *
   * @throws if the permit is malformed, expired, or its signature is invalid.
   *
   * @example
   * ```ts
   * const signedPermit = await relayer.parseSignedDecryptionPermit({
   *   serializedPermit,
   *   transportKeyPair,
   * });
   * ```
   */
  parseSignedDecryptionPermit: FhevmClient["parseSignedDecryptionPermit"] = (parameters) =>
    this.#fhevm.parseSignedDecryptionPermit(parameters);

  /**
   * Generates a fresh ephemeral transport key pair for a user-decrypt session.
   * The relayer re-encrypts decrypted values to this pair's public key, so only
   * the holder of the private key can read them; bind it to a permit via
   * {@link signDecryptionPermit}.
   *
   * @example
   * ```ts
   * const transportKeyPair = await relayer.generateTransportKeyPair();
   * ```
   */
  generateTransportKeyPair: FhevmClient["generateTransportKeyPair"] = async () => {
    await this.init();
    return this.#fhevm.generateTransportKeyPair();
  };
}
