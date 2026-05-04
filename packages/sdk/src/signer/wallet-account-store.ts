import type {
  WalletAccount,
  WalletAccountChange,
  WalletAccountListener,
  WalletAccountStore,
} from "../types";

export function walletAccountsEqual(
  a: WalletAccount | undefined,
  b: WalletAccount | undefined,
): boolean {
  return a?.address === b?.address && a?.chainId === b?.chainId;
}

/**
 * Writable {@link WalletAccountStore} for custom signer adapters. Adapters call
 * {@link MutableWalletAccountStore.setSnapshot} when their underlying wallet
 * provider notifies of a connect, disconnect, account change, or chain change.
 *
 * Most custom adapters should use the {@link createWalletAccountStore} factory
 * rather than instantiating this class directly.
 */
export class MutableWalletAccountStore implements WalletAccountStore {
  readonly #listeners = new Set<WalletAccountListener>();
  #snapshot: WalletAccount | undefined;

  constructor(initial?: WalletAccount) {
    this.#snapshot = initial;
  }

  getSnapshot(): WalletAccount | undefined {
    return this.#snapshot;
  }

  /**
   * Push a new wallet account snapshot. No-op when the next value is
   * value-equal to the current one. Emits `{ previous, next }` to every
   * subscriber otherwise.
   */
  setSnapshot(next: WalletAccount | undefined): void {
    const previous = this.#snapshot;
    if (walletAccountsEqual(previous, next)) {
      return;
    }
    this.#snapshot = next;
    this.#emit({ previous, next });
  }

  subscribe(listener: WalletAccountListener): () => void {
    this.#listeners.add(listener);
    const snapshot = this.#snapshot;
    if (snapshot) {
      listener({ previous: undefined, next: snapshot });
    }
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #emit(change: WalletAccountChange): void {
    for (const listener of this.#listeners) {
      listener(change);
    }
  }
}

/**
 * Create a {@link MutableWalletAccountStore} for a custom {@link GenericSigner}
 * adapter.
 *
 * @param initial - Optional initial wallet account snapshot.
 */
export function createWalletAccountStore(initial?: WalletAccount): MutableWalletAccountStore {
  return new MutableWalletAccountStore(initial);
}
