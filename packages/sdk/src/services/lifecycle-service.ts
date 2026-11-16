import type { CredentialService } from "../credentials/credential-service";
import type { ChainRouter } from "../chains/router";
import type {
  GenericLogger,
  GenericSigner,
  WalletAccountChange,
  WalletAccountListener,
} from "../types";
import { swallow } from "../utils";
import type { CachingService } from "./caching-service";

export type LifecycleServiceOptions = {
  signer?: GenericSigner;
  router: ChainRouter;
  cachingService: CachingService;
  credentialService?: CredentialService;
  clearCredentialsOnWalletChange: boolean;
  logger: GenericLogger;
};

/**
 * Owns signer-lifecycle wiring for {@link ZamaSDK}: subscribes to the signer's
 * wallet-account store on construction, runs the SDK-side handling on every
 * change (relayer chain switch, then credential rotation and decrypt-cache
 * invalidation unless `clearCredentialsOnWalletChange` is `false`), then fans
 * out to external listeners. Unsubscribes on {@link dispose}.
 *
 * @internal — consumed by ZamaSDK; not part of the public surface.
 */
export class LifecycleService {
  readonly #signer: GenericSigner | undefined;
  readonly #router: ChainRouter;
  readonly #cachingService: CachingService;
  readonly #credentialService: CredentialService | undefined;
  readonly #clearCredentialsOnWalletChange: boolean;
  readonly #logger: GenericLogger;
  readonly #walletAccountListeners = new Set<WalletAccountListener>();
  #unsubscribeSigner?: () => void;

  constructor(opts: LifecycleServiceOptions) {
    this.#signer = opts.signer;
    this.#router = opts.router;
    this.#cachingService = opts.cachingService;
    this.#credentialService = opts.credentialService;
    this.#clearCredentialsOnWalletChange = opts.clearCredentialsOnWalletChange;
    this.#logger = opts.logger;
    if (this.#signer) {
      this.#unsubscribeSigner = this.#signer.walletAccount.subscribe((change) => {
        this.#handleWalletAccountChange(change).catch((error) => {
          this.#logger.warn("wallet account handler failed", { error });
        });
      });
    }
  }

  onWalletAccountChange(listener: WalletAccountListener): () => void {
    this.#walletAccountListeners.add(listener);
    return () => {
      this.#walletAccountListeners.delete(listener);
    };
  }

  dispose(): void {
    this.#unsubscribeSigner?.();
    this.#unsubscribeSigner = undefined;
    this.#walletAccountListeners.clear();
  }

  async #handleWalletAccountChange(change: WalletAccountChange): Promise<void> {
    const prev = change.previous;
    const next = change.next;
    // Switch the relayer chain first so cleanup and listeners (keypair warming)
    // see next.chainId rather than chains[0]. An unconfigured chain does not
    // throw here; the next relayer op reports a ConfigurationError.
    const nextChainId = next?.chainId;
    if (nextChainId !== undefined) {
      await swallow(
        "switch relayer chain",
        () => this.#router.switchChain(nextChainId),
        this.#logger,
      );
    }
    // Apps opt out with clearCredentialsOnWalletChange: false. Permits, key pairs,
    // and cached decrypts are keyed by account address, so keeping them never
    // exposes one account's entries to another.
    if (this.#clearCredentialsOnWalletChange) {
      await this.#clearPreviousAccount(prev, next);
    }
    await Promise.all(
      Array.from(this.#walletAccountListeners, (listener) =>
        swallow("wallet account listener", () => listener(change), this.#logger),
      ),
    );
  }

  async #clearPreviousAccount(
    prev: WalletAccountChange["previous"],
    next: WalletAccountChange["next"],
  ): Promise<void> {
    const credentialService = this.#credentialService;
    if (credentialService) {
      await swallow(
        "credential wallet account change",
        () => credentialService.handleWalletAccountChange(prev, next),
        this.#logger,
      );
    }
    if (prev) {
      await swallow(
        "clear decrypt cache",
        () => this.#cachingService.clearForRequester(prev.address),
        this.#logger,
      );
    }
  }
}
