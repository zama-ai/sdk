import { ZamaError, ZamaErrorCode } from "./base";

/**
 * The signer (or delegator) lacks ACL permission to decrypt the handle —
 * `persistAllowed` returned `false`. Terminal and **non-retryable**: the fix is
 * an on-chain grant (`FHE.allow`), or for indexers, to wait for a backfill once
 * the grant lands. Distinct from transient failures like {@link RpcRateLimitError}.
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
