import { ZamaError, ZamaErrorCode } from "./base";

/** User rejected the wallet signature prompt. */
export class SigningRejectedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.SigningRejected, message, options);
    this.name = "SigningRejectedError";
  }
}

/** Wallet signature failed for a reason other than rejection. */
export class SigningFailedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.SigningFailed, message, options);
    this.name = "SigningFailedError";
  }
}

/**
 * Wrap a signing error as {@link SigningRejectedError} or {@link SigningFailedError}.
 * Detects user rejection via EIP-1193 code 4001 or message heuristics.
 */
export function wrapSigningError(error: unknown, context: string): never {
  const hasCode4001 =
    typeof error === "object" && error !== null && "code" in error && error.code === 4001;
  const originalMsg = error instanceof Error ? error.message : String(error);
  const lowerMsg = originalMsg.toLowerCase();
  const hasRejectionMessage =
    lowerMsg.includes("user rejected") || lowerMsg.includes("user denied");
  const fullMessage = `${context}: ${originalMsg}`;
  if (hasCode4001 || hasRejectionMessage) {
    throw new SigningRejectedError(fullMessage, { cause: error });
  }
  throw new SigningFailedError(fullMessage, { cause: error });
}
