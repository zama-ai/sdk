import type { Address } from "viem";
import type {
  ClearSigningCallbacks,
  ShieldCallbacks,
  TransferCallbacks,
  UnshieldCallbacks,
} from "./callbacks";

/** Options for {@link ConfidentialToken.confidentialTransfer}. */
export interface TransferOptions extends TransferCallbacks {
  /** Skip confidential balance validation (e.g. for smart wallets). Default: `false`. */
  skipBalanceCheck?: boolean;
}

/**
 * User-facing approval strategy.
 *
 * - `"exact"` (default): approve exactly `amount`.
 * - `"max"`: approve unlimited.
 * - `"skip"`: assume a pre-existing approval; skip the approve step.
 */
export type ApprovalStrategy = "max" | "exact" | "skip";

/**
 * The resolved shielding execution path — what actually ran on-chain.
 * Reported on {@link ShieldSubmittedEvent}; on a failure, the path is
 * encoded in {@link TransactionErrorEvent.operation} as
 * `"shield:transferAndCall"` or `"shield:approveAndWrap"`. Decided
 * automatically by ERC-165 introspection on the underlying ERC-20.
 *
 * - `"transferAndCall"`: single tx via ERC-1363 (no approval).
 * - `"approveAndWrap"`: legacy two-tx path (`approve` then `wrap`).
 */
export type ShieldPath = "transferAndCall" | "approveAndWrap";

/** Options for {@link WrappedToken.shield}. */
export interface ShieldOptions extends ShieldCallbacks {
  /** See {@link ApprovalStrategy}. Default: `"exact"`. Ignored when the underlying supports ERC-1363 (single-tx path requires no approval). */
  approvalStrategy?: ApprovalStrategy;
  /** Recipient address for the shielded tokens. Defaults to the connected wallet. */
  to?: Address;
}

/** Options for {@link WrappedToken.unshield}. */
export interface UnshieldOptions extends UnshieldCallbacks {
  /** Skip confidential balance validation (e.g. for smart wallets). Default: `false`. */
  skipBalanceCheck?: boolean;
}

/** Options for {@link WrappedToken.unwrap}. */
export type UnwrapOptions = ClearSigningCallbacks;

/** Options for {@link WrappedToken.unwrapAll}. */
export type UnwrapAllOptions = ClearSigningCallbacks;

/** Options for {@link WrappedToken.finalizeUnwrap}. */
export type FinalizeUnwrapOptions = ClearSigningCallbacks;
