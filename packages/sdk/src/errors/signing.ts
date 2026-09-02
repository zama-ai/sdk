import {
  extractRpcErrorCode,
  extractWalletErrorName,
  isInvalidTransportKeyPairMessage,
} from "../utils/error";
import { ZamaError, ZamaErrorCode } from "./base";
import { InvalidTransportKeyPairError } from "./credential";

/**
 * Diagnostic metadata attached to a signing-failure error, on top of the
 * inherited `cause`. All optional and best-effort: `operation` comes from the
 * caller, `rpcCode`/`walletErrorName` are extracted from the wallet's raw
 * error by {@link wrapSigningError}.
 */
export interface SigningErrorMetadata {
  /** Name of the SDK operation that was signing when the wallet/provider failed (e.g. "grantPermit"). */
  operation?: string;
  /** JSON-RPC / EIP-1193 numeric error code found in the failure's cause chain, if any. */
  rpcCode?: number;
  /** `name` of the error class the wallet/provider library threw (e.g. viem's `InvalidParamsRpcError`). */
  walletErrorName?: string;
}

/** User rejected the wallet signature prompt. */
export class SigningRejectedError extends ZamaError {
  /** Name of the SDK operation that was signing when the user rejected. */
  readonly operation: string | undefined;
  /** JSON-RPC / EIP-1193 numeric error code found in the failure's cause chain, if any. */
  readonly rpcCode: number | undefined;
  /** `name` of the error class the wallet/provider library threw. */
  readonly walletErrorName: string | undefined;

  constructor(message: string, options?: ErrorOptions & SigningErrorMetadata) {
    const { operation, rpcCode, walletErrorName, ...errorOptions } = options ?? {};
    super(ZamaErrorCode.SigningRejected, message, errorOptions);
    this.name = "SigningRejectedError";
    this.operation = operation;
    this.rpcCode = rpcCode;
    this.walletErrorName = walletErrorName;
  }
}

/** Wallet signature failed for a reason other than rejection. */
export class SigningFailedError extends ZamaError {
  /** Name of the SDK operation that was signing when the wallet/provider failed. */
  readonly operation: string | undefined;
  /** JSON-RPC / EIP-1193 numeric error code found in the failure's cause chain, if any. */
  readonly rpcCode: number | undefined;
  /** `name` of the error class the wallet/provider library threw. */
  readonly walletErrorName: string | undefined;

  constructor(message: string, options?: ErrorOptions & SigningErrorMetadata) {
    const { operation, rpcCode, walletErrorName, ...errorOptions } = options ?? {};
    super(ZamaErrorCode.SigningFailed, message, errorOptions);
    this.name = "SigningFailedError";
    this.operation = operation;
    this.rpcCode = rpcCode;
    this.walletErrorName = walletErrorName;
  }
}

/**
 * Classify a caught signing error into {@link SigningRejectedError},
 * {@link SigningFailedError}, or {@link InvalidTransportKeyPairError}, and
 * return it (mirroring {@link wrapDecryptError}/{@link wrapEncryptError} —
 * callers `throw` the result rather than this function throwing directly, so
 * a caller can emit an observability event carrying the same error first).
 *
 * Detects user rejection via EIP-1193 code 4001 or message heuristics, and
 * enriches the result with `rpcCode`/`walletErrorName` extracted from `error`
 * (see {@link extractRpcErrorCode}/{@link extractWalletErrorName}) so an
 * integrator can fingerprint/alert on structured fields instead of parsing
 * the message text.
 *
 * Errors that are already typed SDK errors are returned as-is (mirroring
 * {@link wrapEncryptError}/{@link wrapDecryptError}), so callers don't need to
 * repeat an `error instanceof ZamaError` check before calling this.
 */
export function wrapSigningError(
  error: unknown,
  context: { operation: string; description?: string },
): ZamaError {
  if (error instanceof ZamaError) {
    return error;
  }
  const { operation, description } = context;
  const hasCode4001 =
    typeof error === "object" && error !== null && "code" in error && error.code === 4001;
  const originalMsg = error instanceof Error ? error.message : String(error);
  const lowerMsg = originalMsg.toLowerCase();
  const hasRejectionMessage =
    lowerMsg.includes("user rejected") || lowerMsg.includes("user denied");
  const prefix = description ? `${operation}: ${description}` : operation;
  const fullMessage = `${prefix}: ${originalMsg}`;
  if (hasCode4001 || hasRejectionMessage) {
    return new SigningRejectedError(fullMessage, {
      cause: error,
      operation,
      rpcCode: extractRpcErrorCode(error),
      walletErrorName: extractWalletErrorName(error),
    });
  }
  // A stale transport key pair the relayer can't re-derive (post-rotation) is
  // not a signing failure per se — surface it as the typed, self-heal signal so
  // the caller can evict the vault entry and regenerate.
  if (isInvalidTransportKeyPairMessage(originalMsg)) {
    return new InvalidTransportKeyPairError(fullMessage, { cause: error });
  }
  return new SigningFailedError(fullMessage, {
    cause: error,
    operation,
    rpcCode: extractRpcErrorCode(error),
    walletErrorName: extractWalletErrorName(error),
  });
}
