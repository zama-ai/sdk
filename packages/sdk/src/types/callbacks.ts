import type { Hex } from "viem";
import type { ClearSigningIntent } from "../clear-signing";

/** Callback for SDK-generated clear-signing intent previews. */
export interface ClearSigningCallbacks {
  /**
   * Fired when the SDK can describe the next signature or transaction in
   * user-facing terms. Callback errors are swallowed and never abort the SDK
   * operation.
   */
  onClearSigningIntent?: (intent: ClearSigningIntent) => void;
}

/** Progress callbacks for multi-step unshield operations. */
export interface UnshieldCallbacks extends ClearSigningCallbacks {
  /** Fired after the unwrap transaction is submitted. */
  onUnwrapSubmitted?: (txHash: Hex) => void;
  /** Fired when the finalization step begins (receipt parsed, about to finalize). */
  onFinalizing?: () => void;
  /** Fired after the finalize transaction is submitted. */
  onFinalizeSubmitted?: (txHash: Hex) => void;
}

/** Progress callbacks for multi-step shield operations. */
export interface ShieldCallbacks extends ClearSigningCallbacks {
  /** Fired after the ERC-20 approval transaction is submitted (skipped when `approvalStrategy: "skip"`). */
  onApprovalSubmitted?: (txHash: Hex) => void;
  /** Fired after the shield (wrap) transaction is submitted. */
  onShieldSubmitted?: (txHash: Hex) => void;
}

/** Progress callbacks for multi-step confidential transfer operations. */
export interface TransferCallbacks extends ClearSigningCallbacks {
  /** Fired after FHE encryption of the transfer amount completes. */
  onEncryptComplete?: () => void;
  /** Fired after the transfer transaction is submitted. */
  onTransferSubmitted?: (txHash: Hex) => void;
}
