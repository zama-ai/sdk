import type { Address } from "viem";
import { Decryption } from "./namespaces/decryption";
import { Delegations } from "./namespaces/delegations";
import { Permits } from "./namespaces/permits";
import type { ZamaConfig } from "./config/types";
import { CredentialService } from "./credentials/credential-service";
import type { ZamaSDKEvent, ZamaSDKEventInput, ZamaSDKEventListener } from "./events/sdk-events";
import type { ChainRouter } from "./relayer/chain-router";
import type { EncryptParams, EncryptResult } from "./relayer/relayer-sdk.types";
import { CachingService } from "./services/caching-service";
import { DecryptionService } from "./services/decryption-service";
import { DelegationService } from "./services/delegation-service";
import { EncryptionService } from "./services/encryption-service";
import { LifecycleService } from "./services/lifecycle-service";
import { Token } from "./token/token";
import { WrappedToken } from "./token/wrapped-token";
import type {
  GenericProvider,
  GenericSigner,
  GenericStorage,
  WalletAccountListener,
} from "./types";
import { WrappersRegistry } from "./wrappers-registry";

/**
 * ZamaSDK — composes a RelayerSDK with contract abstraction.
 *
 * Exposes domain namespaces for permits, delegations, decryption, and tokens,
 * plus an unchanged registry, a top-level `encrypt`, and lifecycle methods. Internal
 * `*Service` classes do the work; the namespace classes own SDK-level guards
 * (chain alignment, signer requirement, event emission).
 */
export class ZamaSDK {
  readonly router: ChainRouter;
  readonly provider: GenericProvider;
  readonly signer: GenericSigner | undefined;
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
  readonly #registryTTL: number;
  readonly #onEvent: ZamaSDKEventListener;
  readonly #cachingService: CachingService;
  readonly #lifecycleService: LifecycleService;
  readonly #encryptionService: EncryptionService;
  readonly #decryptionService: DecryptionService | undefined;
  readonly #credentialService: CredentialService | undefined;
  readonly #delegationService: DelegationService;

  constructor(config: ZamaConfig) {
    this.router = config.router;
    this.provider = config.provider;
    this.signer = config.signer;
    this.storage = config.storage;
    this.#onEvent = config.onEvent ?? function () {};
    this.#cachingService = new CachingService(config.storage);
    this.#delegationService = new DelegationService({
      provider: this.provider,
      router: this.router,
      emitEvent: this.emitEvent.bind(this),
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
    this.#registryTTL = config.registryTTL;

    if (config.signer) {
      this.#credentialService = new CredentialService({
        router: this.router,
        signer: config.signer,
        keypairTTL: config.keypairTTL,
        permitTTL: config.permitTTL,
        storage: this.storage,
        permitStorage: config.permitStorage,
      });
      this.#decryptionService = new DecryptionService({
        cache: this.#cachingService,
        credentialService: this.#credentialService,
        delegationService: this.#delegationService,
        router: this.router,
        emitEvent: this.emitEvent.bind(this),
      });
    }
    this.#encryptionService = new EncryptionService({
      router: this.router,
      emitEvent: this.emitEvent.bind(this),
    });
    this.#lifecycleService = new LifecycleService({
      signer: config.signer,
      router: this.router,
      cachingService: this.#cachingService,
      credentialService: this.#credentialService,
    });

    this.permits = new Permits({
      signer: this.signer,
      provider: this.provider,
      cachingService: this.#cachingService,
      credentialService: this.#credentialService,
    });
    this.delegations = new Delegations({
      signer: this.signer,
      provider: this.provider,
      delegationService: this.#delegationService,
    });
    this.decryption = new Decryption({
      signer: this.signer,
      provider: this.provider,
      router: this.router,
      decryptionService: this.#decryptionService,
    });
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
      this.#onEvent({
        ...input,
        tokenAddress,
        timestamp: Date.now(),
      } as ZamaSDKEvent);
    } catch (error) {
      // oxlint-disable-next-line no-console
      console.error("[zama-sdk] onEvent listener threw:", error);
    }
  }

  /**
   * Create a {@link WrappersRegistry} instance bound to this SDK's provider.
   * On Mainnet and Sepolia the registry address is resolved automatically.
   *
   * @param registryAddresses - Optional per-chain overrides for this registry instance.
   * @returns A {@link WrappersRegistry} instance.
   *
   * @example
   * ```ts
   * // Mainnet / Sepolia — resolved automatically
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
      registryAddresses,
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
  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    return this.#encryptionService.encrypt(params);
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
    this.router.terminate();
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
