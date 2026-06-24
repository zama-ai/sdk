import { ZamaError, ZamaErrorCode } from "./base";

/**
 * The configured signer/account is not entitled to decrypt a handle.
 *
 * Thrown when an ACL (`persistAllowed`) pre-check shows the actor lacks
 * permission to user-decrypt the handle. This is a terminal, **non-retryable**
 * condition for the current actor: retrying will not help. The fix is an
 * on-chain grant (`FHE.allow`) or, for indexers, to wait for a later block /
 * backfill once the grant lands.
 *
 * Distinguishing this from a transient infrastructure failure
 * (e.g. {@link RpcRateLimitError}, {@link DecryptionFailedError}) lets
 * entitlement-aware consumers branch deterministically instead of pre-checking
 * on-chain out of band or string-matching error messages.
 *
 * @example
 * ```ts
 * try {
 *   await sdk.decryption.decryptValues([{ encryptedValue, contractAddress }]);
 * } catch (e) {
 *   if (e instanceof NotEntitledError) {
 *     // don't retry — wait for an ACL grant / backfill
 *   }
 * }
 * ```
 */
export class NotEntitledError extends ZamaError {
  /** The handle (encrypted value) the actor is not entitled to decrypt. */
  readonly handle: string;
  /** The contract the handle belongs to. */
  readonly contractAddress: string;
  /** The actor (signer or delegator) that lacks ACL permission. */
  readonly account: string;

  constructor(
    args: { handle: string; contractAddress: string; account: string },
    options?: ErrorOptions,
  ) {
    super(
      ZamaErrorCode.NotEntitled,
      `Account ${args.account} is not entitled to decrypt handle ${args.handle} ` +
        `on contract ${args.contractAddress}. This is not a transient failure — ` +
        `the account needs an on-chain ACL grant before it can decrypt this handle.`,
      options,
    );
    this.name = "NotEntitledError";
    this.handle = args.handle;
    this.contractAddress = args.contractAddress;
    this.account = args.account;
  }
}
