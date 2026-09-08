import type { ZamaError } from "./base";
import { extractRevertErrorName } from "./revert";
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

/** ACL error name -> typed SDK error mapping. */
const ACL_ERROR_MAP = {
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
} satisfies Record<string, (cause: unknown) => ZamaError>;

function isAclRevertName(name: string): name is keyof typeof ACL_ERROR_MAP {
  return Object.hasOwn(ACL_ERROR_MAP, name);
}

/**
 * Map known ACL Solidity revert error names to typed ZamaError subclasses.
 * Prefers viem's structured `error.cause.data.errorName` when available,
 * falling back to string-includes matching on the error message.
 * Returns `null` if the revert reason is not recognized.
 * @internal
 */
export function matchAclRevert(error: unknown, mappedCause: unknown): ZamaError | null {
  // Prefer structured error data from viem's ContractFunctionRevertedError
  const errorName = extractRevertErrorName(error);
  if (errorName && isAclRevertName(errorName)) {
    return ACL_ERROR_MAP[errorName](mappedCause);
  }

  // Fallback: string matching for non-viem RPC providers
  const message = error instanceof Error ? error.message : String(error);
  for (const [name, factory] of Object.entries(ACL_ERROR_MAP)) {
    if (message.includes(name)) {
      return factory(mappedCause);
    }
  }

  return null;
}
