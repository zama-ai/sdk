import type { Hex } from "viem";
import { WalletNotConnectedError } from "../errors";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
import type {
  ContractAbi,
  GenericSigner,
  WalletAccount,
  WriteContractArgs,
  WriteContractConfig,
  WriteFunctionName,
} from "../types";
import { MutableWalletAccountStore } from "./wallet-account-store";

/**
 * Abstract base class that implements the shared {@link GenericSigner}
 * boilerplate: wallet-account store, `requireWalletAccount`, idempotent
 * `dispose` / `Disposable`. Subclasses provide `signTypedData`,
 * `writeContract`, and optionally override `onDispose` for cleanup.
 *
 * Using this class is optional — implementing {@link GenericSigner} directly
 * with {@link createWalletAccountStore} remains fully supported.
 */
export abstract class BaseSigner implements GenericSigner, Disposable {
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

  abstract writeContract<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(config: WriteContractConfig<TAbi, TFunctionName, TArgs>): Promise<Hex>;

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
