import type { Address } from "viem";
import type { EncryptedValue } from "../relayer/types";
import type { TransactionResult } from "../types";

/**
 * A batch's lifecycle state. The numbers mirror the batcher contract's own
 * enum, so they are part of the on-chain contract, not an arbitrary encoding.
 */
export const BatchState = {
  /** Open: accepts joins and quits. Always the batcher's `currentBatchId`. */
  Pending: 0,
  /** Closed; the aggregate amount is being decrypted. No user action is possible. */
  Dispatched: 1,
  /** Settled with an exchange rate — the only state in which `claim` succeeds. */
  Finalized: 2,
  /** The route failed or the callback deadline passed; `quit` refunds the original deposit. */
  Canceled: 3,
} as const;

/** Union of all {@link BatchState} values. */
export type BatchState = (typeof BatchState)[keyof typeof BatchState];

/** Addresses that make up one confidential vault. */
export interface VaultAddresses {
  /**
   * The ERC-4626 vault contract that holds the underlying asset and issues
   * shares. Optional — both batchers report it on chain. Passing it does not
   * skip that read: it is verified against what the batchers report.
   */
  vault?: Address;
  /** The batcher users join to deposit the confidential underlying asset into the vault. */
  depositBatcher: Address;
  /** The batcher users join to redeem confidential shares back into the underlying asset. */
  redeemBatcher: Address;
}

/** Options for {@link VaultBatcher.join}. */
export interface JoinOptions {
  /**
   * Skip the confidential-balance pre-flight before joining — for accounts
   * whose balance the connected signer cannot decrypt, such as smart wallets.
   */
  skipBalanceCheck?: boolean;
}

/** Options for {@link Vault.deposit} and {@link Vault.requestRedeem}. */
export interface VaultJoinOptions extends JoinOptions {
  /**
   * Account credited in the batch. Defaults to the connected wallet address.
   *
   * Set this to join on behalf of another account — but note that the
   * beneficiary, not the caller, then owns the position: only they can
   * {@link VaultBatcher.quit} it, and {@link VaultBatcher.claim} pays out to
   * them.
   */
  beneficiary?: Address;
  /**
   * Unix timestamp until which the batcher's operator grant on the joined
   * token is valid. Only used when a grant isn't already active. Defaults to
   * `Token.setOperator`'s own default (now + 1 hour).
   */
  operatorUntil?: number;
}

/** What the batcher reported for a successful join. */
export interface JoinResult extends TransactionResult {
  /** The batch the join landed in. */
  batchId: bigint;
  /** The account credited — the beneficiary, which may not be the caller. */
  beneficiary: Address;
  /**
   * The encrypted amount actually credited, which is **not** always the amount
   * requested: an ERC-7984 transfer moves zero rather than reverting when the
   * balance is short. Decrypt it to confirm the join landed in full.
   */
  confidentialJoinedAmount: EncryptedValue;
}
