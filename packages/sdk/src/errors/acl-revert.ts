import type { ZamaError } from "./base";
import {
  AclPausedError,
  DelegationContractIsSelfError,
  DelegationCooldownError,
  DelegationDelegateEqualsContractError,
  DelegationExpirationTooSoonError,
  DelegationExpiryUnchangedError,
  DelegationNotFoundError,
  DelegationSelfNotAllowedError,
} from "./delegation";

/** Extract the decoded error name from a viem ContractFunctionRevertedError. */
function extractRevertErrorName(error: unknown): string | null {
  if (
    error instanceof Error &&
    "cause" in error &&
    error.cause !== null &&
    error.cause !== undefined &&
    typeof error.cause === "object" &&
    "data" in error.cause &&
    error.cause.data !== null &&
    error.cause.data !== undefined &&
    typeof error.cause.data === "object" &&
    "errorName" in error.cause.data &&
    typeof error.cause.data.errorName === "string"
  ) {
    return error.cause.data.errorName;
  }
  return null;
}

/** ACL error name -> typed SDK error mapping. */
const ACL_ERROR_MAP: Record<string, (cause: Error | undefined) => ZamaError> = {
  AlreadyDelegatedOrRevokedInSameBlock: (cause) =>
    new DelegationCooldownError(
      "Only one delegate/revoke per (delegator, delegate, contract) per block. Wait for the next block before retrying.",
      { cause },
    ),
  SenderCannotBeContractAddress: (cause) =>
    new DelegationContractIsSelfError("The contract address cannot be the caller address.", {
      cause,
    }),
  EnforcedPause: (cause) =>
    new AclPausedError(
      "The ACL contract is paused. Delegation operations are temporarily disabled.",
      { cause },
    ),
  SenderCannotBeDelegate: (cause) =>
    new DelegationSelfNotAllowedError("Cannot delegate to yourself (delegate === msg.sender).", {
      cause,
    }),
  DelegateCannotBeContractAddress: (cause) =>
    new DelegationDelegateEqualsContractError(
      "Delegate address cannot be the same as the contract address.",
      { cause },
    ),
  ExpirationDateBeforeOneHour: (cause) =>
    new DelegationExpirationTooSoonError("Expiration date must be at least 1 hour in the future.", {
      cause,
    }),
  ExpirationDateAlreadySetToSameValue: (cause) =>
    new DelegationExpiryUnchangedError("The new expiration date is the same as the current one.", {
      cause,
    }),
  NotDelegatedYet: (cause) =>
    new DelegationNotFoundError("Cannot revoke: no active delegation exists.", { cause }),
};

/**
 * Map known ACL Solidity revert error names to typed ZamaError subclasses.
 * Prefers viem's structured `error.cause.data.errorName` when available,
 * falling back to string-includes matching on the error message.
 * Returns `null` if the revert reason is not recognized.
 * @public
 */
export function matchAclRevert(error: unknown): ZamaError | null {
  const cause = error instanceof Error ? error : undefined;

  // Prefer structured error data from viem's ContractFunctionRevertedError
  const errorName = extractRevertErrorName(error);
  if (errorName && errorName in ACL_ERROR_MAP) {
    return ACL_ERROR_MAP[errorName]?.(cause) ?? null;
  }

  // Fallback: string matching for non-viem RPC providers
  const message = error instanceof Error ? error.message : String(error);
  for (const [name, factory] of Object.entries(ACL_ERROR_MAP)) {
    if (message.includes(name)) {
      return factory(cause);
    }
  }

  return null;
}
