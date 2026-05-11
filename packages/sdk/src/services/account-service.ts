import type { CredentialService } from "../credentials/credential-service";
import {
  ChainMismatchError,
  SignerNotConfiguredError,
  WalletAccountNotReadyError,
} from "../errors";
import type { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import type {
  GenericProvider,
  GenericSigner,
  WalletAccount,
  WalletAccountChange,
  WalletAccountListener,
} from "../types";
import { swallow } from "../utils";
import type { CachingService } from "./caching-service";

export type AccountServiceOptions = {
  provider: GenericProvider;
  signer?: GenericSigner;
  cache: CachingService;
  relayer: RelayerDispatcher;
  credentialService?: CredentialService;
};

/**
 * Owns wallet-account state for {@link ZamaSDK}: signer subscription,
 * chain-alignment validation, and change dispatch — first running the
 * SDK-side cleanup (credential rotation, cache invalidation, relayer chain
 * switch) and then fanning out to external listeners.
 *
 * @internal — consumed by ZamaSDK; not part of the public surface.
 */
export class AccountService {
  readonly #provider: GenericProvider;
  readonly #signer: GenericSigner | undefined;
  readonly #cache: CachingService;
  readonly #relayer: RelayerDispatcher;
  readonly #credentialService: CredentialService | undefined;
  readonly #walletAccountListeners = new Set<WalletAccountListener>();
  #unsubscribeSigner?: () => void;

  constructor(opts: AccountServiceOptions) {
    this.#provider = opts.provider;
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

  async requireAlignedWalletAccount(operation: string): Promise<WalletAccount> {
    if (!this.#signer) {
      throw new SignerNotConfiguredError(operation);
    }
    const signer = this.#signer;
    let account: WalletAccount;
    try {
      account = signer.requireWalletAccount(operation);
    } catch (error) {
      if (!(error instanceof WalletAccountNotReadyError) || !signer.refreshWalletAccount) {
        throw error;
      }
      await signer.refreshWalletAccount();
      account = signer.requireWalletAccount(operation);
    }
    const providerChainId = await this.#provider.getChainId();
    if (account.chainId !== providerChainId) {
      throw new ChainMismatchError({
        operation,
        signerChainId: account.chainId,
        providerChainId,
      });
    }
    return account;
  }

  async requireChainAlignment(operation: string): Promise<number> {
    return (await this.requireAlignedWalletAccount(operation)).chainId;
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
