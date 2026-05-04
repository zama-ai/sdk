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
  #resolved: boolean;

  constructor(initial?: WalletAccount) {
    this.#snapshot = initial;
    this.#resolved = initial !== undefined;
  }

  getSnapshot(): WalletAccount | undefined {
    return this.#snapshot;
  }

  /**
   * Whether the store has received at least one snapshot (via the constructor
   * or {@link setSnapshot}). Adapters whose initial account is only available
   * asynchronously start unresolved; callers can distinguish "still loading"
   * from "wallet not connected".
   */
  isReady(): boolean {
    return this.#resolved;
  }

  /**
   * Push a new wallet account snapshot. No-op when the next value is
   * value-equal to the current one. Emits `{ previous, next }` to every
   * subscriber otherwise.
   */
  setSnapshot(next: WalletAccount | undefined): void {
    this.#resolved = true;
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
