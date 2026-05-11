import {
  ChainMismatchError,
  SignerNotConfiguredError,
  WalletAccountNotReadyError,
} from "../errors";
import type {
  GenericProvider,
  GenericSigner,
  WalletAccount,
  WalletAccountChange,
  WalletAccountListener,
} from "../types";
import { swallow } from "../utils";

export type AccountServiceOptions = {
  provider: GenericProvider;
  signer?: GenericSigner;
  onBeforeDispatch?: (change: WalletAccountChange) => Promise<void>;
};

/**
 * Owns wallet-account state for {@link ZamaSDK}: signer subscription,
 * chain-alignment validation, change dispatch with optional internal cleanup
 * (`onBeforeDispatch`) followed by external listener fan-out.
 *
 * @internal — consumed by ZamaSDK; not part of the public surface.
 */
export class AccountService {
  readonly #provider: GenericProvider;
  readonly #signer: GenericSigner | undefined;
  readonly #onBeforeDispatch?: (change: WalletAccountChange) => Promise<void>;
  readonly #walletAccountListeners = new Set<WalletAccountListener>();
  #unsubscribeSigner?: () => void;

  constructor(opts: AccountServiceOptions) {
    this.#provider = opts.provider;
    this.#signer = opts.signer;
    this.#onBeforeDispatch = opts.onBeforeDispatch;
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
    const beforeDispatch = this.#onBeforeDispatch;
    if (beforeDispatch) {
      await swallow("account before-dispatch", () => beforeDispatch(change));
    }
    await Promise.all(
      Array.from(this.#walletAccountListeners, (listener) =>
        swallow("wallet account listener", () => listener(change)),
      ),
    );
  }
}
