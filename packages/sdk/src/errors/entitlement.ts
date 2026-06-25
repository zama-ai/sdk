import { ZamaError, ZamaErrorCode } from "./base";

/**
 * The signer (or delegator) lacks ACL permission to decrypt the encrypted value —
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
  /** The encrypted value the actor is not entitled to decrypt. */
  readonly encryptedValue: string;
  /** The contract the encrypted value belongs to. */
  readonly contractAddress: string;
  /** The actor (signer or delegator) that lacks ACL permission. */
  readonly account: string;

  constructor(
    args: { encryptedValue: string; contractAddress: string; account: string },
    options?: ErrorOptions,
  ) {
    super(
      ZamaErrorCode.NotEntitled,
      `Account ${args.account} is not entitled to decrypt encrypted value ${args.encryptedValue} ` +
        `on contract ${args.contractAddress}. This is not a transient failure — ` +
        `the account needs an on-chain ACL grant before it can decrypt this encrypted value.`,
      options,
    );
    this.name = "NotEntitledError";
    this.encryptedValue = args.encryptedValue;
    this.contractAddress = args.contractAddress;
    this.account = args.account;
  }
}
