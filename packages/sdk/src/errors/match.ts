import { ZamaError } from "./base";
import type { ZamaErrorCode } from "./base";
import type { ChainMismatchError } from "./chain";
import type {
  NoCiphertextError,
  TransportKeyPairExpiredError,
  InvalidTransportKeyPairError,
} from "./credential";
import type {
  AclPausedError,
  DelegationContractIsSelfError,
  DelegationCooldownError,
  DelegationDelegateEqualsContractError,
  DelegationExpirationTooSoonError,
  DelegationExpiredError,
  DelegationExpiryUnchangedError,
  DelegationNotFoundError,
  DelegationNotPropagatedError,
  DelegationSelfNotAllowedError,
} from "./delegation";
import type { DecryptionFailedError, EncryptionFailedError } from "./encryption";
import type {
  BalanceCheckUnavailableError,
  ERC20ReadFailedError,
  InsufficientAllowanceError,
  InsufficientConfidentialBalanceError,
  InsufficientERC20BalanceError,
} from "./balance";
import type { ConfigurationError, RelayerRequestFailedError } from "./relayer";
import type { NotEntitledError } from "./entitlement";
import type { RpcRateLimitError } from "./rpc";
import type {
  SignerNotConfiguredError,
  WalletAccountNotReadyError,
  WalletNotConnectedError,
} from "./signer";
import type { SigningFailedError, SigningRejectedError } from "./signing";
import type { TransactionRevertedError } from "./transaction";

/**
 * Maps each {@link ZamaErrorCode} to the error class thrown with that code, so
 * {@link matchZamaError} handlers receive the matched subtype instead of the base
 * `ZamaError`.
 */
export interface ErrorForCode {
  /** Thrown for {@link ZamaErrorCode.SigningRejected}. */
  [ZamaErrorCode.SigningRejected]: SigningRejectedError;
  /** Thrown for {@link ZamaErrorCode.SigningFailed}. */
  [ZamaErrorCode.SigningFailed]: SigningFailedError;
  /** Thrown for {@link ZamaErrorCode.EncryptionFailed}. */
  [ZamaErrorCode.EncryptionFailed]: EncryptionFailedError;
  /** Thrown for {@link ZamaErrorCode.DecryptionFailed}. */
  [ZamaErrorCode.DecryptionFailed]: DecryptionFailedError;
  /** Thrown for {@link ZamaErrorCode.TransactionReverted}. */
  [ZamaErrorCode.TransactionReverted]: TransactionRevertedError;
  /** Thrown for {@link ZamaErrorCode.TransportKeyPairExpired}. */
  [ZamaErrorCode.TransportKeyPairExpired]: TransportKeyPairExpiredError;
  /** Thrown for {@link ZamaErrorCode.InvalidTransportKeyPair}. */
  [ZamaErrorCode.InvalidTransportKeyPair]: InvalidTransportKeyPairError;
  /** Thrown for {@link ZamaErrorCode.NoCiphertext}. */
  [ZamaErrorCode.NoCiphertext]: NoCiphertextError;
  /** Thrown for {@link ZamaErrorCode.RelayerRequestFailed}. */
  [ZamaErrorCode.RelayerRequestFailed]: RelayerRequestFailedError;
  /** Thrown for {@link ZamaErrorCode.NotEntitled}. */
  [ZamaErrorCode.NotEntitled]: NotEntitledError;
  /** Thrown for {@link ZamaErrorCode.RpcRateLimited}. */
  [ZamaErrorCode.RpcRateLimited]: RpcRateLimitError;
  /** Thrown for {@link ZamaErrorCode.Configuration}. */
  [ZamaErrorCode.Configuration]: ConfigurationError;
  /** Thrown for {@link ZamaErrorCode.DelegationSelfNotAllowed}. */
  [ZamaErrorCode.DelegationSelfNotAllowed]: DelegationSelfNotAllowedError;
  /** Thrown for {@link ZamaErrorCode.DelegationCooldown}. */
  [ZamaErrorCode.DelegationCooldown]: DelegationCooldownError;
  /** Thrown for {@link ZamaErrorCode.DelegationNotFound}. */
  [ZamaErrorCode.DelegationNotFound]: DelegationNotFoundError;
  /** Thrown for {@link ZamaErrorCode.DelegationExpired}. */
  [ZamaErrorCode.DelegationExpired]: DelegationExpiredError;
  /** Thrown for {@link ZamaErrorCode.InsufficientConfidentialBalance}. */
  [ZamaErrorCode.InsufficientConfidentialBalance]: InsufficientConfidentialBalanceError;
  /** Thrown for {@link ZamaErrorCode.InsufficientERC20Balance}. */
  [ZamaErrorCode.InsufficientERC20Balance]: InsufficientERC20BalanceError;
  /** Thrown for {@link ZamaErrorCode.InsufficientAllowance}. */
  [ZamaErrorCode.InsufficientAllowance]: InsufficientAllowanceError;
  /** Thrown for {@link ZamaErrorCode.BalanceCheckUnavailable}. */
  [ZamaErrorCode.BalanceCheckUnavailable]: BalanceCheckUnavailableError;
  /** Thrown for {@link ZamaErrorCode.ERC20ReadFailed}. */
  [ZamaErrorCode.ERC20ReadFailed]: ERC20ReadFailedError;
  /** Thrown for {@link ZamaErrorCode.DelegationExpiryUnchanged}. */
  [ZamaErrorCode.DelegationExpiryUnchanged]: DelegationExpiryUnchangedError;
  /** Thrown for {@link ZamaErrorCode.DelegationDelegateEqualsContract}. */
  [ZamaErrorCode.DelegationDelegateEqualsContract]: DelegationDelegateEqualsContractError;
  /** Thrown for {@link ZamaErrorCode.DelegationContractIsSelf}. */
  [ZamaErrorCode.DelegationContractIsSelf]: DelegationContractIsSelfError;
  /** Thrown for {@link ZamaErrorCode.AclPaused}. */
  [ZamaErrorCode.AclPaused]: AclPausedError;
  /** Thrown for {@link ZamaErrorCode.DelegationExpirationTooSoon}. */
  [ZamaErrorCode.DelegationExpirationTooSoon]: DelegationExpirationTooSoonError;
  /** Thrown for {@link ZamaErrorCode.DelegationNotPropagated}. */
  [ZamaErrorCode.DelegationNotPropagated]: DelegationNotPropagatedError;
  /** Thrown for {@link ZamaErrorCode.ChainMismatch}. */
  [ZamaErrorCode.ChainMismatch]: ChainMismatchError;
  /** Thrown for {@link ZamaErrorCode.SignerNotConfigured}. */
  [ZamaErrorCode.SignerNotConfigured]: SignerNotConfiguredError;
  /** Thrown for {@link ZamaErrorCode.WalletNotConnected}. */
  [ZamaErrorCode.WalletNotConnected]: WalletNotConnectedError;
  /** Thrown for {@link ZamaErrorCode.WalletAccountNotReady}. */
  [ZamaErrorCode.WalletAccountNotReady]: WalletAccountNotReadyError;
}

/**
 * Pattern-match on a {@link ZamaError} by its error code. Each handler receives the
 * error class for its code, so subclass fields are available without a cast.
 * Falls through to the `_` wildcard handler if no specific handler matches.
 * Returns `undefined` if the error is not a `ZamaError` and no `_` handler is provided.
 *
 * @example
 * ```ts
 * matchZamaError(error, {
 *   SIGNING_REJECTED: () => toast("Please approve in wallet"),
 *   INSUFFICIENT_CONFIDENTIAL_BALANCE: (e) => toast(`Need ${e.requested}, have ${e.available}`),
 *   RELAYER_REQUEST_FAILED: (e) => toast(`Relayer failed (${e.statusCode})`),
 *   _: () => toast("Unknown error"),
 * });
 * ```
 */
export function matchZamaError<R>(
  error: unknown,
  handlers: { [K in ZamaErrorCode]?: (error: ErrorForCode[K]) => R } & {
    _?: (error: unknown) => R;
  },
): R | undefined {
  if (error instanceof ZamaError) {
    // `error.code` narrows the handler at runtime; the cast bridges the per-code param types.
    const handler = handlers[error.code] as ((error: ZamaError) => R) | undefined;
    if (handler) {
      return handler(error);
    }
  }
  return handlers._?.(error);
}
