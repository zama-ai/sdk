import type { Hex } from "viem";

/** Progress callbacks for multi-step unshield operations. */
export interface UnshieldCallbacks {
  /** Fired after the unwrap transaction is submitted. */
  onUnwrapSubmitted?: (txHash: Hex) => void;
  /** Fired when the finalization step begins (receipt parsed, about to finalize). */
  onFinalizing?: () => void;
  /** Fired after the finalize transaction is submitted. */
  onFinalizeSubmitted?: (txHash: Hex) => void;
}

/** Progress callbacks for multi-step shield operations. */
export interface ShieldCallbacks {
  /** Fired after the ERC-20 approval transaction is submitted (skipped when `approvalStrategy: "skip"`). */
  onApprovalSubmitted?: (txHash: Hex) => void;
  /** Fired after the shield (wrap) transaction is submitted. */
  onShieldSubmitted?: (txHash: Hex) => void;
}

/** Progress callbacks for multi-step confidential transfer operations. */
export interface TransferCallbacks {
  /** Fired after FHE encryption of the transfer amount completes. */
  onEncryptComplete?: () => void;
  /** Fired after the transfer transaction is submitted. */
  onTransferSubmitted?: (txHash: Hex) => void;
}
