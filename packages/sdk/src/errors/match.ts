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
  SignerAddressMismatchError,
  SignerCapabilityError,
  SignerNotConfiguredError,
  WalletAccountNotReadyError,
  WalletNotConnectedError,
} from "./signer";
import type { SigningFailedError, SigningRejectedError } from "./signing";
import type { TransactionRevertedError } from "./transaction";

/**
 * Identity type that fails to instantiate unless `T` maps every code to a `ZamaError`.
 * Guards presence + value type only: a wrong-but-valid mapping (a code pointing at a
 * structurally identical sibling class) still compiles — `errors.test-d.ts` backstops that.
 */
type Complete<T extends Record<ZamaErrorCode, ZamaError>> = T;

/**
 * Maps each {@link ZamaErrorCode} to the error class thrown with that code, so
 * {@link matchZamaError} handlers receive the matched subtype instead of the base
 * `ZamaError`. Hand-maintained; the `Complete` wrapper fails the build if a code is
 * added without an entry here (or mapped to a non-`ZamaError`).
 */
type ErrorForCode = Complete<{
  [ZamaErrorCode.SigningRejected]: SigningRejectedError;
  [ZamaErrorCode.SigningFailed]: SigningFailedError;
  [ZamaErrorCode.EncryptionFailed]: EncryptionFailedError;
  [ZamaErrorCode.DecryptionFailed]: DecryptionFailedError;
  [ZamaErrorCode.TransactionReverted]: TransactionRevertedError;
  [ZamaErrorCode.TransportKeyPairExpired]: TransportKeyPairExpiredError;
  [ZamaErrorCode.InvalidTransportKeyPair]: InvalidTransportKeyPairError;
  [ZamaErrorCode.NoCiphertext]: NoCiphertextError;
  [ZamaErrorCode.RelayerRequestFailed]: RelayerRequestFailedError;
  [ZamaErrorCode.NotEntitled]: NotEntitledError;
  [ZamaErrorCode.RpcRateLimited]: RpcRateLimitError;
  [ZamaErrorCode.Configuration]: ConfigurationError;
  [ZamaErrorCode.DelegationSelfNotAllowed]: DelegationSelfNotAllowedError;
  [ZamaErrorCode.DelegationCooldown]: DelegationCooldownError;
  [ZamaErrorCode.DelegationNotFound]: DelegationNotFoundError;
  [ZamaErrorCode.DelegationExpired]: DelegationExpiredError;
  [ZamaErrorCode.InsufficientConfidentialBalance]: InsufficientConfidentialBalanceError;
  [ZamaErrorCode.InsufficientERC20Balance]: InsufficientERC20BalanceError;
  [ZamaErrorCode.InsufficientAllowance]: InsufficientAllowanceError;
  [ZamaErrorCode.BalanceCheckUnavailable]: BalanceCheckUnavailableError;
  [ZamaErrorCode.ERC20ReadFailed]: ERC20ReadFailedError;
  [ZamaErrorCode.DelegationExpiryUnchanged]: DelegationExpiryUnchangedError;
  [ZamaErrorCode.DelegationDelegateEqualsContract]: DelegationDelegateEqualsContractError;
  [ZamaErrorCode.DelegationContractIsSelf]: DelegationContractIsSelfError;
  [ZamaErrorCode.AclPaused]: AclPausedError;
  [ZamaErrorCode.DelegationExpirationTooSoon]: DelegationExpirationTooSoonError;
  [ZamaErrorCode.DelegationNotPropagated]: DelegationNotPropagatedError;
  [ZamaErrorCode.ChainMismatch]: ChainMismatchError;
  [ZamaErrorCode.SignerNotConfigured]: SignerNotConfiguredError;
  [ZamaErrorCode.SignerMissingCapability]: SignerCapabilityError;
  [ZamaErrorCode.SignerAddressMismatch]: SignerAddressMismatchError;
  [ZamaErrorCode.WalletNotConnected]: WalletNotConnectedError;
  [ZamaErrorCode.WalletAccountNotReady]: WalletAccountNotReadyError;
}>;

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
