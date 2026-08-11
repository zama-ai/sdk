import type { Address } from "viem";
import type { ChainRouter } from "./chains/router";
import type { ZamaConfig } from "./config/types";
import { CredentialService } from "./credentials/credential-service";
import { DerivationSecretHolder } from "./credentials/keypair-wrapping";
import { DerivationSecretSchema } from "./credentials/schemas";
import { ConfigurationError } from "./errors";
import type { ZamaSDKEvent, ZamaSDKEventInput, ZamaSDKEventListener } from "./events/sdk-events";
import { Decryption } from "./namespaces/decryption";
import { Delegations } from "./namespaces/delegations";
import { Offline } from "./namespaces/offline";
import { Permits } from "./namespaces/permits";
import type { EncryptParams, FhevmRelayerOptions, RelayerSDK } from "./relayer/types";
import { CachingService } from "./services/caching-service";
import { DecryptionService } from "./services/decryption-service";
import { DelegationService } from "./services/delegation-service";
import { EncryptionService } from "./services/encryption-service";
import { LifecycleService } from "./services/lifecycle-service";
import { OfflineService } from "./services/offline-service";
import { Token } from "./token/token";
import { WrappedToken } from "./token/wrapped-token";
import type {
  GenericLogger,
  GenericProvider,
  GenericSigner,
  GenericStorage,
  WalletAccountListener,
} from "./types";
import { parseSchema } from "./validation";
import { WrappersRegistry } from "./wrappers-registry";

/** Instance-level options that are deliberately not part of the shareable config object. */
export interface ZamaSDKOptions {
  /**
   * Opt-in at-rest wrapping of the transport key pair's private half, for headless
   * contexts only (CLI tools, bare-metal agents, local dev), never a browser bundle,
   * and requires a secure context for WebCrypto. Must be at least 32 bytes of real
   * entropy from a CSPRNG or secrets manager, not a passphrase. Omit for the default:
   * plaintext, security delegated to the storage backend. Consumed at construction and
   * never retained on the SDK instance.
   */
  transportKeyPairDerivationSecret?: string | Uint8Array;
}

/**
 * Omitting the option means cleartext-at-rest by choice; passing it as `undefined` means the
 * caller asked for wrapping and the value went missing, so it must fail instead of downgrading.
 */
function assertDerivationSecretNotUnset(options: ZamaSDKOptions): void {
  if (
    !Object.hasOwn(options, "transportKeyPairDerivationSecret") ||
    options.transportKeyPairDerivationSecret !== undefined
  ) {
    return;
  }
  throw new ConfigurationError(
    "transportKeyPairDerivationSecret was passed as undefined, which usually means the environment variable it reads is unset (e.g. process.env.ZAMA_TRANSPORT_KEY_PAIR_SECRET). Supply the secret, or omit the option entirely to persist transport key pairs in cleartext on purpose.",
  );
}

/**
 * Wrapping only helps where no platform keystore protects the store, which is the headless
 * case. `importScripts` catches a browser worker, where `window` and `document` are absent.
 */
function assertDerivationSecretHeadless(secret: string | Uint8Array | undefined): void {
  if (secret === undefined) {
    return;
  }
  const { importScripts } = globalThis as { importScripts?: unknown };
  const headless =
    typeof window === "undefined" &&
    typeof document === "undefined" &&
    typeof importScripts !== "function";
  if (headless) {
    return;
  }
  throw new ConfigurationError(
    "transportKeyPairDerivationSecret is supported in headless environments only (CLI tools, servers, agents). Remove the option: an environment with a platform keystore, or one that ships a bundle, must delegate at-rest security of the transport key pair to the storage backend.",
  );
}

/**
 * Copies a `Uint8Array` secret so the holder only ever zeroizes the SDK's own buffer, and
 * a caller zeroizing theirs cannot corrupt later wraps. Strings are immutable, so no copy.
 */
function derivationSecretHolder(
  secret: string | Uint8Array | undefined,
): DerivationSecretHolder | undefined {
  if (secret === undefined) {
    return undefined;
  }
  const parsed = parseSchema(DerivationSecretSchema, secret);
  return new DerivationSecretHolder(typeof parsed === "string" ? parsed : new Uint8Array(parsed));
}

/**
 * ZamaSDK — composes a RelayerSDK with contract abstraction.
 *
 * Exposes domain namespaces for permits, delegations, decryption, offline
 * signing, and tokens, plus an unchanged registry, a top-level `encrypt`, and
 * lifecycle methods. Internal `*Service` classes do the work; the namespace
 * classes own SDK-level guards (chain alignment, signer requirement, event
 * emission).
 */
export class ZamaSDK {
  readonly #router: ChainRouter;
  /** Read-only chain access used for all contract reads. */
  readonly provider: GenericProvider;
  /** Wallet signer used for write operations, or `undefined` when the SDK is read-only. */
  readonly signer: GenericSigner | undefined;
  /** Storage for cached permits and transport key pairs. */
  readonly storage: GenericStorage;
  /**
   * A {@link WrappersRegistry} instance auto-configured for the current chain.
   * Uses built-in defaults from chain configs, and the SDK's `registryTTL` if configured.
   */
  readonly registry: WrappersRegistry;
  /** Permit and keypair management. */
  readonly permits: Permits;
  /** On-chain decryption-delegation management. */
  readonly delegations: Delegations;
  /** FHE decryption (user, delegated user, public). */
  readonly decryption: Decryption;
  /** Offline-signing pipeline: `prepare` builds an unsigned tx the caller signs and broadcasts out-of-process — for HSM, policy-engine, and cross-process custody workflows. */
  readonly offline: Offline;
  readonly #registryTTL: number;
  readonly #registryAddresses: Record<number, Address>;
  readonly #onEvent: ZamaSDKEventListener;
  readonly #logger: GenericLogger;
  readonly #cachingService: CachingService;
  readonly #lifecycleService: LifecycleService;
  readonly #encryptionService: EncryptionService;
  readonly #decryptionService: DecryptionService | undefined;
  readonly #credentialService: CredentialService;
  readonly #delegationService: DelegationService;
  readonly #offlineService: OfflineService;

  constructor(config: ZamaConfig, options: ZamaSDKOptions = {}) {
    assertDerivationSecretNotUnset(options);
    assertDerivationSecretHeadless(options.transportKeyPairDerivationSecret);
    // Constructor-local on purpose: neither the raw secret nor the holder may become a field.
    const derivationSecret = derivationSecretHolder(options.transportKeyPairDerivationSecret);

    this.#router = config.router;
    this.provider = config.provider;
    this.signer = config.signer;
    this.storage = config.storage;
    this.#onEvent = config.onEvent ?? function () {};
    this.#logger = config.logger;
    this.#cachingService = new CachingService(config.storage, this.#logger);
    this.#delegationService = new DelegationService({
      provider: this.provider,
      router: config.router,
      emitEvent: this.emitEvent.bind(this),
      logger: this.#logger,
    });

    const registryAddresses: Record<number, Address> = {};
    for (const chain of config.chains) {
      if (chain.registryAddress) {
        registryAddresses[chain.id] = chain.registryAddress;
      }
    }
    this.registry = new WrappersRegistry({
      provider: this.provider,
      registryAddresses,
      registryTTL: config.registryTTL,
    });
    this.#registryAddresses = registryAddresses;
    this.#registryTTL = config.registryTTL;

    // CredentialService is always constructed (with optional signer) so
    // public-decrypt / encryption flows and pre-wallet-connect construction
    // work; permit-signing methods require a signer and throw without one.
    this.#credentialService = new CredentialService({
      router: config.router,
      signer: config.signer,
      transportKeyPairTTL: config.transportKeyPairTTL,
      permitTTL: config.permitTTL,
      scope: config.transportKeyPairScope,
      derivationSecret,
      storage: this.storage,
      permitStorage: config.permitStorage,
      logger: this.#logger,
    });
    if (config.signer) {
      this.#decryptionService = new DecryptionService({
        cache: this.#cachingService,
        credentialService: this.#credentialService,
        delegationService: this.#delegationService,
        router: config.router,
        emitEvent: this.emitEvent.bind(this),
      });
    }
    this.#encryptionService = new EncryptionService({
      router: config.router,
      emitEvent: this.emitEvent.bind(this),
    });
    this.#lifecycleService = new LifecycleService({
      signer: config.signer,
      router: config.router,
      cachingService: this.#cachingService,
      credentialService: this.#credentialService,
      logger: this.#logger,
    });
    this.#offlineService = new OfflineService({
      provider: this.provider,
      router: config.router,
      encryption: this.#encryptionService,
      emitEvent: (input, tokenAddress) => this.emitEvent(input, tokenAddress),
    });

    this.permits = new Permits({
      signer: this.signer,
      provider: this.provider,
      cachingService: this.#cachingService,
      credentialService: this.#credentialService,
      logger: this.#logger,
    });
    this.delegations = new Delegations({
      signer: this.signer,
      provider: this.provider,
      delegationService: this.#delegationService,
    });
    this.decryption = new Decryption({
      signer: this.signer,
      provider: this.provider,
      router: config.router,
      decryptionService: this.#decryptionService,
    });
    this.offline = new Offline(this.#offlineService);
  }

  /**
   * Subscribe to wallet account transitions.
   *
   * @param listener - Called on each transition with a {@link WalletAccountChange} carrying
   *   `previous` and `next` wallet account snapshots; either may be `undefined` for
   *   connect and disconnect transitions.
   * @returns An unsubscribe function; calling it removes the listener.
   *
   * @internal
   */
  onWalletAccountChange(listener: WalletAccountListener): () => void {
    return this.#lifecycleService.onWalletAccountChange(listener);
  }

  /**
   * The SDK-wide logger, exposed so contract abstractions ({@link Token},
   * {@link WrappedToken}) can route their best-effort failures through the
   * same sink. Silent by default.
   *
   * @internal
   */
  get logger(): GenericLogger {
    return this.#logger;
  }

  /**
   * The single-chain relayer backend for the **currently active** chain.
   */
  get relayer(): RelayerSDK {
    return this.#router.relayer;
  }

  /**
   * Emit a structured SDK event into the unified SDK event stream.
   *
   * Listener exceptions are caught and logged so that a misbehaving subscriber
   * can never corrupt SDK operations.
   *
   * Application code should subscribe via the `onEvent` config option, never
   * call this directly.
   *
   * @internal
   */
  emitEvent(input: ZamaSDKEventInput, tokenAddress?: Address): void {
    try {
      this.#onEvent({ ...input, tokenAddress, timestamp: Date.now() } as ZamaSDKEvent);
    } catch (error) {
      this.#logger.warn(`${input.type} event listener silently failed`, { error });
    }
  }

  /**
   * Create a {@link WrappersRegistry} instance bound to this SDK's provider.
   * Inherits the registry addresses derived from the SDK's chain configs, so
   * the result is consistent with {@link ZamaSDK.registry}.
   *
   * @param registryAddresses - Optional per-chain overrides for this registry instance.
   * @returns A {@link WrappersRegistry} instance.
   *
   * @example
   * ```ts
   * // Addresses resolved from the SDK's chain configs
   * const registry = sdk.createWrappersRegistry();
   *
   * // Hardhat or custom chain — override per chain for this registry instance
   * const registry = sdk.createWrappersRegistry({ [31337]: "0xYourRegistry" });
   *
   * const pairs = await registry.getTokenPairs();
   * ```
   */
  createWrappersRegistry(registryAddresses?: Record<number, Address>): WrappersRegistry {
    return new WrappersRegistry({
      provider: this.provider,
      registryAddresses: { ...this.#registryAddresses, ...registryAddresses },
      registryTTL: this.#registryTTL,
    });
  }

  /**
   * Encrypt one or more plaintext values into FHE ciphertexts.
   *
   * @param params - Typed FHE inputs, the target contract address, and the user address.
   * @returns External encrypted values and the input proof for on-chain submission.
   * @throws if FHE encryption fails. {@link EncryptionFailedError}
   *
   * @example
   * ```ts
   * const { encryptedValues, inputProof } = await sdk.encrypt({
   *   values: [{ value: 1000n, type: "euint64" }],
   *   contractAddress: "0xToken",
   *   userAddress: "0xUser",
   * });
   * ```
   */
  async encrypt(params: EncryptParams, options?: Pick<FhevmRelayerOptions, "signal" | "timeout">) {
    return this.#encryptionService.encryptValues(params, options);
  }

  /**
   * Create a high-level ERC-20-style interface for an ERC-7984 confidential token.
   * Supports balance queries, transfers, operator approvals, and decryption.
   *
   * For ERC-7984 wrappers (shield/unshield/allowance), use {@link createWrappedToken} instead.
   *
   * @param address - The confidential token contract address.
   * @returns A {@link Token} instance bound to this SDK.
   *
   * @example
   * ```ts
   * const token = sdk.createToken(cUSDT);
   * const balance = await token.balanceOf(userAddress);
   * ```
   */
  createToken(address: Address): Token {
    return new Token(this, address);
  }

  /**
   * Create a high-level interface for an ERC-7984 wrapper token.
   * Extends {@link Token} with shield/unshield/allowance/finalize-unwrap operations.
   *
   * @param address - The wrapper token contract address.
   * @returns A {@link WrappedToken} instance bound to this SDK.
   *
   * @example
   * ```ts
   * const wrapped = sdk.createWrappedToken(wUSDT);
   * await wrapped.shield(1_000_000n);
   * ```
   */
  createWrappedToken(address: Address): WrappedToken {
    return new WrappedToken(this, address);
  }

  /**
   * Unsubscribe from signer lifecycle events without terminating the relayer.
   * Call this when the SDK instance is being replaced but the relayer is shared
   * (e.g. React provider remount in Strict Mode).
   */
  dispose(): void {
    this.#lifecycleService.dispose();
  }

  /**
   * Terminate the relayer backend and clean up resources.
   * Call this when the SDK is no longer needed (e.g. on unmount or shutdown).
   */
  terminate(): void {
    this.dispose();
    this.signer?.dispose?.();
  }

  /**
   * Implements the TC39 Explicit Resource Management protocol.
   * Calls {@link terminate} when the `using` binding goes out of scope,
   * unsubscribing signer events and shutting down the relayer.
   *
   * @example
   * ```ts
   * {
   *   using sdk = new ZamaSDK({ relayer, provider, signer, storage });
   *   await sdk.permits.grantPermit([cUSDT]);
   *   const balance = await sdk.createToken(cUSDT).balanceOf(userAddress);
   * } // sdk.terminate() called automatically here
   * ```
   */
  [Symbol.dispose](): void {
    this.terminate();
  }
}
