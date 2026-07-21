import type { WalletAccount } from "../types";

/** Connected-wallet context threaded into query factories to scope cache keys and gate signer-dependent queries. */
export interface SignerQueryContext {
  /** Connected wallet account; queries that need a signer stay disabled until it is set. */
  walletAccount?: WalletAccount;
}
