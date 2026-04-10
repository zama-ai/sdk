import { ZamaError, ZamaErrorCode } from "./base";
import type { CredentialSet } from "../credentials/credential-set";

/**
 * Thrown when a multi-batch `allow()` call partially succeeds: at least one
 * batch was signed and persisted before a later batch failed.
 *
 * {@link partialResult} contains credentials for the addresses that were
 * successfully signed. They are immediately usable for decryption.
 *
 * Retrying `allow()` with the full address list is safe — already-persisted
 * batches are found in storage and not re-signed.
 *
 * @example
 * ```ts
 * try {
 *   const creds = await credManager.allow(addr1, addr2, ..., addr25);
 * } catch (e) {
 *   if (e instanceof PartialCredentialError) {
 *     // Use what succeeded immediately
 *     const partial = e.partialResult;
 *     console.log(`${partial.batches.length} batch(es) signed before failure`);
 *     // Retry — already-persisted batches are reused automatically
 *     const full = await credManager.allow(addr1, addr2, ..., addr25);
 *   }
 * }
 * ```
 */
export class PartialCredentialError extends ZamaError {
  /** Credentials for the batches that were successfully signed before the failure. */
  readonly partialResult: CredentialSet;

  constructor(partialResult: CredentialSet, cause: Error) {
    super(ZamaErrorCode.PartialBatchFailure, cause.message, { cause });
    this.name = "PartialCredentialError";
    this.partialResult = partialResult;
  }
}
