import { createUnsignedLegacyDecryptionPermitEip712 as createUnsignedLegacyDecryptionPermitEip712Action } from "@fhevm/sdk/actions/base";
import {
  createFhevmBaseClient,
  createFhevmDecryptClient,
  createFhevmEncryptClient,
  hasFhevmRuntimeConfig,
} from "@fhevm/sdk/viem";
import {
  createFhevmCleartextBaseClient,
  createFhevmCleartextDecryptClient,
  createFhevmCleartextEncryptClient,
} from "@fhevm/sdk/viem/cleartext";
import { createPublicClient, custom, http } from "viem";
import { toFhevmChain } from "../chains/to-fhevm-chain";
import type { FheChain } from "../chains/types";
import { ConfigurationError } from "../errors";
import { getAppliedWireRuntime, hasAppliedLocateFile } from "./applied-runtime";
import type { LoggerService } from "../services/logger-service";
import {
  DEFAULT_ENCRYPT_WORKER_TIMEOUTS,
  EncryptWorkerClient,
  type EncryptWorkerClientConfig,
  type EncryptWorkerTimeouts,
} from "../worker/encrypt-worker-client";
import { BUNDLED_ENCRYPT_WORKER } from "../worker/spawn";
import type {
  FhevmBaseClient,
  FhevmClient,
  FhevmDecryptClient,
  FhevmEncryptBackend,
  FhevmRelayerOptions,
  RelayerSDK,
  RelayerOptions,
  WireRuntimeConfig,
} from "./types";

/** The `@fhevm/sdk` client inputs the worker realm rebuilds its own client from. */
type EncryptInitPayload = EncryptWorkerClientConfig["initPayload"];

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
  /** Encrypt-worker offload mode; see `web()`'s `offloadEncrypt` option. */
  offloadEncrypt?: "auto" | boolean;
  /** Watchdog deadlines for the encrypt worker; `web()` defaults every field before it gets here. */
  offloadTimeouts?: EncryptWorkerTimeouts;
  /** Custom source for the encrypt worker; see `web()`'s `offloadWorker` option. */
  offloadWorker?: string | URL | (() => Worker);
  /** Receives worker log lines and offload-fallback warnings. */
  logger: LoggerService;
}

/**
 * Single-chain FHE backend that drives `@fhevm/sdk` on the calling thread with
 * capability-scoped lazy initialization.
 * EIP-712 signing is done by the signer layer; this backend builds the typed
 * data and, on decrypt, reassembles the new SDK's signed permit from the
 * interface's params + the previously returned signature.
 *
 * @remarks
 * Each method delegates to the narrowest base, decrypt, or encrypt client,
 * adding two cross-cutting behaviors that the delegated signatures don't
 * express:
 *
 * - **Lazy init.** Each operation initializes only the capability it requires.
 *   Public decrypt avoids WASM, private decrypt loads TKMS only, and encryption
 *   alone loads TFHE and the FHE encryption key.
 * - **Option merging.** The chain's default options (`auth`, `timeout`, `debug`)
 *   are spread in first, then the per-call `options`, so a per-call value always
 *   wins over the chain default. Serialization helpers make no relayer
 *   round-trip, so they inject no options.
 *
 * @internal
 */
export class FhevmRelayer implements RelayerSDK {
  readonly #chain: FheChain;
  readonly #base: FhevmBaseClient;
  readonly #decrypt: FhevmDecryptClient;
  readonly #encrypt: FhevmEncryptBackend;
  readonly #defaultOptions: Partial<FhevmRelayerOptions>;
  #encryptInitPromise: Promise<void> | undefined;

  /**
   * Builds capability-scoped `@fhevm/sdk` clients for the chain and captures
   * the chain's `auth`/`timeout`/`debug` as request defaults. Construction is
   * cheap; each client's one-time init is deferred to its first operation.
   */
  constructor(config: FhevmRelayerConfig) {
    this.#chain = config.chain;
    const { timeout, debug, batchRpcCalls, moduleVersions, fheEncryptionKey } =
      config.options ?? {};
    const auth = this.#chain.auth ? toFhevmAuth(this.#chain.auth) : undefined;
    const transport =
      typeof this.#chain.network === "string"
        ? http(this.#chain.network)
        : custom(this.#chain.network);
    const params = {
      publicClient: createPublicClient({ transport }),
      chain: toFhevmChain(this.#chain),
      options: { batchRpcCalls, moduleVersions, fheEncryptionKey },
    };
    this.#defaultOptions = {
      ...(auth !== undefined && { auth }),
      ...(timeout !== undefined && { timeout }),
      ...(debug !== undefined && { debug }),
    };
    // The FHE key is always fetched here, on the calling thread, so the chain's
    // default request options (auth in particular) apply; a worker realm has no
    // access to them.
    const prefetchKey = () =>
      this.#base.fetchFheEncryptionKeyBytes({ options: this.#defaultOptions });
    // Re-listed rather than spread: the upstream client exposes an enumerable
    // `ready` getter, and a spread would call it, starting init at construction.
    const withInlineInit = (client: FhevmEncryptBackend): FhevmEncryptBackend => ({
      init: async () => {
        await prefetchKey();
        await client.init();
      },
      encryptValue: (parameters) => client.encryptValue(parameters),
      encryptValues: (parameters) => client.encryptValues(parameters),
      fetchFheEncryptionKeyBytes: (parameters) => client.fetchFheEncryptionKeyBytes(parameters),
    });
    if (config.cleartext) {
      this.#base = createFhevmCleartextBaseClient(params);
      this.#decrypt = createFhevmCleartextDecryptClient(params);
      this.#encrypt = withInlineInit(createFhevmCleartextEncryptClient(params));
    } else {
      this.#base = createFhevmBaseClient(params);
      this.#decrypt = createFhevmDecryptClient(params);
      this.#encrypt = this.#buildEncryptBackend(config, params, {
        prefetchKey,
        createInlineClient: () => withInlineInit(createFhevmEncryptClient(params)),
      });
    }
  }

  /**
   * Picks the encrypt backend for a non-cleartext chain: the worker client when
   * offload is on and reachable, the inline calling-thread client otherwise.
   */
  #buildEncryptBackend(
    config: FhevmRelayerConfig,
    params: { chain: EncryptInitPayload["chain"]; options: EncryptInitPayload["clientOptions"] },
    inline: {
      prefetchKey: EncryptWorkerClientConfig["prefetchKey"];
      createInlineClient: () => FhevmEncryptBackend;
    },
  ): FhevmEncryptBackend {
    const offload = config.offloadEncrypt ?? false;
    const strict = offload === true;
    const workerAvailable =
      typeof Worker === "function" &&
      (config.offloadWorker !== undefined || BUNDLED_ENCRYPT_WORKER);
    // Silent both ways: offload off is what the caller asked for, and a realm
    // with no Worker is an environment fact that would warn on every SSR
    // render. Strict skips the capability check, since construction runs during
    // that render and the failure must surface at call time instead.
    if (offload === false || !(strict || workerAvailable)) {
      return inline.createInlineClient();
    }
    const runtime = getAppliedWireRuntime();
    const blocker = encryptOffloadBlocker(runtime);
    if (blocker !== undefined && !strict) {
      // Always on the console: the alternative is an opaque rejection at
      // encrypt time, or WASM assets silently resolved from the default URLs.
      config.logger.warnAlways(`Encryption runs on the calling thread: ${blocker}.`);
      return inline.createInlineClient();
    }
    const workerClient = new EncryptWorkerClient({
      initPayload: { chain: params.chain, clientOptions: params.options, runtime: runtime ?? {} },
      network: this.#chain.network,
      prefetchKey: inline.prefetchKey,
      createInlineClient: inline.createInlineClient,
      logger: config.logger,
      timeouts: config.offloadTimeouts ?? DEFAULT_ENCRYPT_WORKER_TIMEOUTS,
      workerSource: config.offloadWorker,
      // Strict with a blocker: the client degrades at init, which rejects at
      // call time rather than at config time.
      blockedReason: blocker,
      strict,
    });
    return {
      init: () => workerClient.init(),
      encryptValue: (parameters) => workerClient.encryptValue(parameters),
      encryptValues: (parameters) => workerClient.encryptValues(parameters),
      // Served from the calling thread: routing it through the worker would
      // structured-clone the ~50 MB key back out on every call. `ignoreCache`
      // therefore refreshes this thread's cache, not the worker's seeded key.
      fetchFheEncryptionKeyBytes: (parameters) => this.#base.fetchFheEncryptionKeyBytes(parameters),
      dispose: () => workerClient.dispose(),
    };
  }

  /** The FHE chain this backend is bound to. */
  get chain() {
    return this.#chain;
  }

  // Only a fulfilled init is memoized: a rejection clears the memo so the next
  // encryption retries instead of inheriting a transient key-fetch failure.
  #initEncrypt = (): Promise<void> => {
    this.#encryptInitPromise ??= this.#encrypt.init().catch((error: unknown) => {
      this.#encryptInitPromise = undefined;
      throw error;
    });
    return this.#encryptInitPromise;
  };

  /**
   * Releases the encrypt worker once in-flight encryptions settle and drops the
   * memoized init; the next encryption spawns a fresh worker and re-initializes.
   */
  dispose = (): void => {
    this.#encryptInitPromise = undefined;
    this.#encrypt.dispose?.();
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
    await this.#base.init();
    return this.#base.decryptPublicValue({
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
    await this.#base.init();
    return this.#base.decryptPublicValues({
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
    await this.#base.init();
    return this.#base.decryptPublicValuesWithSignatures({
      ...parameters,
      options: { ...this.#defaultOptions, ...parameters.options },
    });
  };

  /**
   * Encrypts one typed input under the chain's FHE key, bound to the contract it
   * targets and the user submitting it, and returns the ciphertext handle plus
   * the input proof the contract verifies on-chain. `type` is the FHE type
   * with the `e` prefix (`"euint64"`, `"ebool"`, `"eaddress"`).
   *
   * @example
   * ```ts
   * const { encryptedValue, inputProof } = await relayer.encryptValue({
   *   value: { type: "euint64", value: 1000n },
   *   contractAddress: "0xToken…",
   *   userAddress: "0xUser…",
   * });
   * ```
   */
  encryptValue: FhevmClient["encryptValue"] = async (parameters) => {
    await this.#initEncrypt();
    return this.#encrypt.encryptValue({
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
   *     { type: "euint64", value: 1000n },
   *     { type: "ebool", value: true },
   *   ],
   *   contractAddress: "0xToken…",
   *   userAddress: "0xUser…",
   * });
   * ```
   */
  encryptValues: FhevmClient["encryptValues"] = async (parameters) => {
    await this.#initEncrypt();
    return this.#encrypt.encryptValues({
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
    await this.#decrypt.init();
    return this.#decrypt.decryptValue({
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
    await this.#decrypt.init();
    return this.#decrypt.decryptValues({
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
    await this.#decrypt.init();
    return this.#decrypt.decryptValuesFromPairs({
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
    // Served from the base client, which shares the key cache with the encrypt
    // client: initializing encryption here would spawn the encrypt worker and
    // wait out its bring-up for a key this thread fetches itself.
    await this.#base.init();
    return this.#base.fetchFheEncryptionKeyBytes({
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
    await this.#base.init();
    return this.#base.signDecryptionPermit(parameters);
  };

  /**
   * Builds the unsigned EIP-712 typed data for a V1 decryption permit, without
   * signing it — the signer-less counterpart to {@link signDecryptionPermit}.
   * Hand the result to an out-of-process signer for `eth_signTypedData_v4`,
   * then verify the returned signature via {@link parseSignedDecryptionPermit}.
   *
   * Not on `@fhevm/sdk`'s client decorator, so it's called directly against
   * the base client rather than through a decorated method.
   *
   * @example
   * ```ts
   * const eip712 = await relayer.createUnsignedLegacyDecryptionPermitEip712({
   *   transportKeyPair,
   *   contractAddresses: ["0xToken…"],
   *   startTimestamp: Math.floor(Date.now() / 1000),
   *   durationSeconds: 60 * 60 * 24,
   *   // delegatorAddress: "0xOwner…", // omit for a self permit
   * });
   * ```
   */
  createUnsignedLegacyDecryptionPermitEip712: RelayerSDK["createUnsignedLegacyDecryptionPermitEip712"] =
    (parameters) => createUnsignedLegacyDecryptionPermitEip712Action(this.#base, parameters);

  // Permit/key-pair helpers carry no request options. Parsing explicitly
  // initializes the capability that validates the restored value; serialization
  // resolves the frozen context internally (via initPublicAction), which reads
  // on-chain state.

  /**
   * Serializes a transport key pair to a hex `{ publicKey, privateKey }` pair for
   * storage or transport, so a decryption session can resume without regenerating
   * keys. Reverse of {@link parseTransportKeyPair}.
   *
   * @example
   * ```ts
   * const stored = await relayer.serializeTransportKeyPair({ transportKeyPair });
   * // { publicKey: "0x…", privateKey: "0x…" }
   * ```
   */
  serializeTransportKeyPair: FhevmClient["serializeTransportKeyPair"] = (parameters) =>
    this.#decrypt.serializeTransportKeyPair(parameters);

  /**
   * Serializes a signed permit to a plain, JSON-stringifiable object (version,
   * EIP-712 payload, signature, signer) for caching or transport. Reverse of
   * {@link parseSignedDecryptionPermit}.
   *
   * @example
   * ```ts
   * const serialized = await relayer.serializeSignedDecryptionPermit({ signedPermit });
   * localStorage.setItem("permit", JSON.stringify(serialized));
   * ```
   */
  serializeSignedDecryptionPermit: FhevmClient["serializeSignedDecryptionPermit"] = (parameters) =>
    this.#base.serializeSignedDecryptionPermit(parameters);

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
  parseTransportKeyPair: FhevmClient["parseTransportKeyPair"] = async (parameters) => {
    await this.#decrypt.init();
    return this.#decrypt.parseTransportKeyPair(parameters);
  };

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
  parseSignedDecryptionPermit: FhevmClient["parseSignedDecryptionPermit"] = async (parameters) => {
    await this.#base.init();
    return this.#base.parseSignedDecryptionPermit(parameters);
  };

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
    await this.#decrypt.init();
    return this.#decrypt.generateTransportKeyPair();
  };
}

/**
 * The one reason, if any, this thread's configuration cannot be reproduced in
 * the worker realm, so offload is worse than inline there.
 */
function encryptOffloadBlocker(runtime: WireRuntimeConfig | undefined): string | undefined {
  // A runtime `locateFile` is a function: it cannot be cloned into the worker
  // realm, which would silently resolve WASM assets from the default URLs.
  if (hasAppliedLocateFile()) {
    return "a runtime locateFile cannot cross the encrypt worker boundary";
  }
  // Unreadable here, so the worker would run on fhevm defaults: an auth it
  // carries would 401 inside the worker as an application error, which never degrades.
  if (runtime === undefined && hasFhevmRuntimeConfig()) {
    return "a runtime config set outside createConfig cannot be replicated in the encrypt worker realm";
  }
  return undefined;
}

/**
 * Translates the SDK's public {@link FheChain.auth} shape (discriminated by
 * `__type`) into the `type`-discriminated `auth` that `@fhevm/sdk` expects.
 *
 * @throws if the auth discriminator is not one of the supported kinds.
 */
function toFhevmAuth(
  auth: NonNullable<FheChain["auth"]>,
): NonNullable<FhevmRelayerOptions["auth"]> {
  const type = auth["__type"];
  switch (type) {
    case "ApiKeyHeader":
      return { type, value: auth.value, header: auth.header };
    case "ApiKeyCookie":
      return { type, value: auth.value, cookie: auth.cookie };
    case "BearerToken":
      return { type, token: auth.token };
    default:
      throw new ConfigurationError(`Unknown auth type: ${String(type)}`);
  }
}
