import { ZamaError, ZamaErrorCode } from "./base";

/** ERC-20 approval transaction failed. */
export class ApprovalFailedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.ApprovalFailed, message, options);
    this.name = "ApprovalFailedError";
  }
}

/** On-chain transaction reverted. */
export class TransactionRevertedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.TransactionReverted, message, options);
    this.name = "TransactionRevertedError";
  }
}

/** The underlying ERC-20 does not support ERC-1363 (payable token). */
export class ERC1363NotSupportedError extends ZamaError {
  readonly tokenAddress: string;

  constructor(tokenAddress: string, options?: ErrorOptions) {
    super(
      ZamaErrorCode.ERC1363NotSupported,
      `Underlying token ${tokenAddress} does not support ERC-1363`,
      options,
    );
    this.name = "ERC1363NotSupportedError";
    this.tokenAddress = tokenAddress;
  }
}
