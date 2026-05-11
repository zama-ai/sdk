import { SignerNotConfiguredError } from "../errors";
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
  readonly #signer: GenericSigner | undefined;
  readonly #walletAccountListeners = new Set<WalletAccountListener>();

  constructor(opts: AccountServiceOptions) {
    this.#signer = opts.signer;
  }

  async requireAlignedWalletAccount(operation: string): Promise<WalletAccount> {
    if (!this.#signer) {
      throw new SignerNotConfiguredError(operation);
    }
    throw new Error("not yet implemented");
  }

  onWalletAccountChange(listener: WalletAccountListener): () => void {
    this.#walletAccountListeners.add(listener);
    return () => {
      this.#walletAccountListeners.delete(listener);
    };
  }
}
