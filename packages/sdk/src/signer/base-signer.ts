import type { Hex } from "viem";
import { WalletNotConnectedError } from "../errors";
import type { EIP712TypedData } from "../relayer/types";
import type { WalletAccount } from "../types";
import { MutableWalletAccountStore } from "./wallet-account-store";

/**
 * Abstract base class that supplies the wallet-account / dispose
 * boilerplate every signer adapter needs: an observable wallet-account
 * store, `requireWalletAccount`, and an idempotent `dispose` /
 * `Disposable`. Subclasses provide `signTypedData` and at least one
 * tx-signing capability (`writeContract` and/or `signTransaction`) — the
 * resulting concrete class automatically satisfies {@link GenericSigner}.
 *
 * Using this class is optional — implementing {@link GenericSigner} directly
 * with {@link createWalletAccountStore} remains fully supported.
 */
export abstract class BaseSigner implements Disposable {
  readonly walletAccount: MutableWalletAccountStore;
  #disposed = false;

  constructor(initial?: WalletAccount) {
    this.walletAccount = new MutableWalletAccountStore(initial);
  }

  requireWalletAccount(operation: string): WalletAccount {
    const account = this.walletAccount.getSnapshot();
    if (!account) {
      throw new WalletNotConnectedError(operation);
    }
    return account;
  }

  abstract signTypedData(typedData: EIP712TypedData): Promise<Hex>;

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.onDispose();
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  protected onDispose(): void {}
}
