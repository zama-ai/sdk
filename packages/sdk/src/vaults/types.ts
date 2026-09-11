import type { Address } from "viem";

/** Addresses that make up one confidential vault. */
export interface VaultAddresses {
  /** The ERC-4626 vault contract that holds the underlying asset and issues shares. */
  vault: Address;
  /** The batcher users join to deposit the confidential underlying asset into the vault. */
  depositBatcher: Address;
  /** The batcher users join to redeem confidential shares back into the underlying asset. */
  redeemBatcher: Address;
}

/** Options for {@link Vault.deposit} and {@link Vault.requestWithdrawal}. */
export interface VaultJoinOptions {
  /**
   * Account credited in the batch. Defaults to the connected wallet address.
   * Set this to join on behalf of another account.
   */
  beneficiary?: Address;
  /**
   * Unix timestamp until which the batcher's operator grant on the joined
   * token is valid. Only used when a grant isn't already active. Defaults to
   * `Token.setOperator`'s own default (now + 1 hour).
   */
  operatorDeadline?: number;
}
