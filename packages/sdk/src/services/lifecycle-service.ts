import type { CredentialService } from "../credentials/credential-service";
import type { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import type { GenericSigner, WalletAccountChange, WalletAccountListener } from "../types";
import { swallow } from "../utils";
import type { CachingService } from "./caching-service";

export type LifecycleServiceOptions = {
  signer?: GenericSigner;
  cache: CachingService;
  relayer: RelayerDispatcher;
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
  readonly #cache: CachingService;
  readonly #relayer: RelayerDispatcher;
  readonly #credentialService: CredentialService | undefined;
  readonly #walletAccountListeners = new Set<WalletAccountListener>();
  #unsubscribeSigner?: () => void;

  constructor(opts: LifecycleServiceOptions) {
    this.#signer = opts.signer;
    this.#cache = opts.cache;
    this.#relayer = opts.relayer;
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
    const credentialService = this.#credentialService;
    if (credentialService) {
      await swallow("credential wallet account change", () =>
        credentialService.handleWalletAccountChange(prev, next),
      );
    }
    if (prev) {
      await swallow("clear decrypt cache", () => this.#cache.clearForRequester(prev.address));
    }
    const nextChainId = next?.chainId;
    if (nextChainId !== undefined) {
      void swallow("switch relayer chain", () => this.#relayer.switchChain(nextChainId));
    }
    await Promise.all(
      Array.from(this.#walletAccountListeners, (listener) =>
        swallow("wallet account listener", () => listener(change)),
      ),
    );
  }
}
