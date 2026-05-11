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

export type AccountServiceOptions = {
  provider: GenericProvider;
  signer?: GenericSigner;
  onBeforeDispatch?: (change: WalletAccountChange) => Promise<void>;
};

/**
 * Owns wallet-account state for {@link ZamaSDK}: signer subscription,
 * chain-alignment validation, change dispatch with internal cleanup +
 * external listener fan-out.
 *
 * @internal — consumed by ZamaSDK; not part of the public surface.
 */
export class AccountService {
  readonly #provider: GenericProvider;
  readonly #signer: GenericSigner | undefined;
  readonly #walletAccountListeners = new Set<WalletAccountListener>();

  constructor(opts: AccountServiceOptions) {
    this.#provider = opts.provider;
    this.#signer = opts.signer;
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
}
