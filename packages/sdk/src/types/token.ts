import type { Address } from "viem";
import type { ShieldCallbacks, TransferCallbacks, UnshieldCallbacks } from "./callbacks";

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
 * User-facing shielding strategy.
 *
 * - `"auto"` (default): probe the underlying with ERC-165 and use ERC-1363
 *   `transferAndCall` (single tx, no approval) when supported, otherwise
 *   fall back to `approve` + `wrap` (two txs). On the auto path, a contract
 *   revert during `transferAndCall` falls back to `approveAndWrap`; user
 *   rejections and RPC failures do not (they propagate so the caller never
 *   sees a second wallet popup or risks a duplicate broadcast).
 * - `"transferAndCall"`: force the single-tx path. Throws
 *   {@link ERC1363NotSupportedError} when the underlying does not advertise
 *   ERC-1363 support, and never falls back on revert.
 * - `"approveAndWrap"`: skip detection and run the legacy two-tx path
 *   (`approve` then `wrap`). Honours `approvalStrategy`.
 */
export type ShieldStrategy = "auto" | "transferAndCall" | "approveAndWrap";

/**
 * The resolved shielding execution path — what actually ran on-chain.
 *
 * Reported on {@link ShieldSubmittedEvent} (always set) and on
 * {@link TransactionErrorEvent} when `operation === "shield"` (set to the
 * path that failed). Distinct from {@link ShieldStrategy} which is the
 * user-facing input and adds `"auto"`; `"auto"` is never a `ShieldPath`
 * because it has been resolved by the time an event fires.
 *
 * - `"transferAndCall"`: single transaction. The user calls
 *   `underlying.transferAndCall(wrapper, amount, data)`; the wrapper's
 *   `onTransferReceived` callback receives the underlying tokens and mints
 *   confidential tokens to `from` (self-shield, `data === "0x"`) or to the
 *   address encoded in `data` (shield-to-other, raw 20-byte address). No
 *   ERC-20 approval is needed.
 * - `"approveAndWrap"`: two transactions. The user calls `underlying.approve`
 *   (skipped when `approvalStrategy === "skip"` or the existing allowance is
 *   sufficient) and then `wrapper.wrap(recipient, amount)`. Used when the
 *   underlying does not implement ERC-1363, or when the caller forced
 *   `shieldStrategy: "approveAndWrap"`.
 */
export type ShieldPath = Exclude<ShieldStrategy, "auto">;

/** Options for {@link Token.shield}. */
export interface ShieldOptions extends ShieldCallbacks {
  /** See {@link ApprovalStrategy}. Default: `"exact"`. Ignored on the `transferAndCall` execution path (i.e. when `shieldStrategy` is `"transferAndCall"`, or `"auto"` and the underlying supports ERC-1363). */
  approvalStrategy?: ApprovalStrategy;
  /** Shielding method: `"auto"` probes ERC-1363 support (default), `"transferAndCall"` forces single-tx (errors if unsupported), `"approveAndWrap"` forces legacy two-tx path. */
  shieldStrategy?: ShieldStrategy;
  /** Recipient address for the shielded tokens. Defaults to the connected wallet. */
  to?: Address;
}

/** Options for {@link ConfidentialToken.unshield}. */
export interface UnshieldOptions extends UnshieldCallbacks {
  /** Skip confidential balance validation (e.g. for smart wallets). Default: `false`. */
  skipBalanceCheck?: boolean;
}
