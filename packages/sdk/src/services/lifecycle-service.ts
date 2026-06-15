import type { CredentialService } from "../credentials/credential-service";
import type { ChainRouter } from "../relayer/chain-router";
import type { GenericSigner, WalletAccountChange, WalletAccountListener } from "../types";
import { swallow } from "../utils";
import type { CachingService } from "./caching-service";

export type LifecycleServiceOptions = {
  signer?: GenericSigner;
  router: ChainRouter;
  cachingService: CachingService;
  credentialService?: CredentialService;
};

/**
 * Owns signer-lifecycle wiring for {@link ZamaSDK}: subscribes to the signer's
 * wallet-account store on construction, runs the SDK-side cleanup (credential
 * rotation, decrypt-cache invalidation, relayer chain switch) on every change,
 * then fans out to external listeners. Unsubscribes on {@link dispose}.
 *
 * @internal — consumed by ZamaSDK; not part of the public surface.
 */
export class LifecycleService {
  readonly #signer: GenericSigner | undefined;
  readonly #router: ChainRouter;
  readonly #cachingService: CachingService;
  readonly #credentialService: CredentialService | undefined;
  readonly #walletAccountListeners = new Set<WalletAccountListener>();
  #unsubscribeSigner?: () => void;

  constructor(opts: LifecycleServiceOptions) {
    this.#signer = opts.signer;
    this.#router = opts.router;
    this.#cachingService = opts.cachingService;
    this.#credentialService = opts.credentialService;
    if (this.#signer) {
      this.#unsubscribeSigner = this.#signer.walletAccount.subscribe((change) => {
        this.#handleWalletAccountChange(change).catch((error) => {
          // oxlint-disable-next-line no-console
          console.warn("[zama-sdk] wallet account handler failed:", error);
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
    // switchChain runs first so credential cleanup, decrypt-cache invalidation,
    // and external listeners observe the dispatcher on next.chainId. Downstream
    // keypair warming (driven by listeners — see ZamaProvider) therefore
    // dispatches against the wallet chain rather than chains[0]. `swallow`
    // suspends one microtask for error containment, not for I/O —
    // ChainRouter.switchChain is synchronous.
    const nextChainId = next?.chainId;
    if (nextChainId !== undefined) {
      await swallow("switch relayer chain", () => this.#router.switchChain(nextChainId));
    }
    const credentialService = this.#credentialService;
    if (credentialService) {
      await swallow("credential wallet account change", () =>
        credentialService.handleWalletAccountChange(prev, next),
      );
    }
    if (prev) {
      await swallow("clear decrypt cache", () =>
        this.#cachingService.clearForRequester(prev.address),
      );
    }
    await Promise.all(
      Array.from(this.#walletAccountListeners, (listener) =>
        swallow("wallet account listener", () => listener(change)),
      ),
    );
  }
}
