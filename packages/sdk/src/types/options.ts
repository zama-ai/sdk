import type { Address } from "viem";
import type { ShieldCallbacks, TransferCallbacks, UnshieldCallbacks } from "./callbacks";

/** Options for {@link ConfidentialToken.confidentialTransfer}. */
export interface TransferOptions extends TransferCallbacks {
  /** Skip confidential balance validation (e.g. for smart wallets). Default: `false`. */
  skipBalanceCheck?: boolean;
}

/** Options for {@link Token.shield}. */
export interface ShieldOptions extends ShieldCallbacks {
  /** ERC-20 approval strategy: `"exact"` approves only `amount`, `"max"` approves unlimited, `"skip"` assumes pre-existing approval. Default: `"exact"`. */
  approvalStrategy?: "max" | "exact" | "skip";
  /** Recipient address for the shielded tokens. Defaults to the connected wallet. */
  to?: Address;
}

/** Options for {@link ConfidentialToken.unshield}. */
export interface UnshieldOptions extends UnshieldCallbacks {
  /** Skip confidential balance validation (e.g. for smart wallets). Default: `false`. */
  skipBalanceCheck?: boolean;
}
