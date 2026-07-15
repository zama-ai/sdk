import { ZamaError, ZamaErrorCode } from "./base";

/**
 * The on-chain read needed to verify a downloaded FHE public key or CRS
 * against `KMSGeneration` failed — an RPC problem (timeout, rate limit, an
 * id not yet finalized on-chain), not a digest mismatch. Kept distinct from
 * {@link KeyDigestMismatchError} so a flaky RPC provider can't be mistaken
 * for a security incident. Safe to retry.
 */
export class KeyDigestVerificationFailedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.KeyDigestVerificationFailed, message, options);
    this.name = "KeyDigestVerificationFailedError";
  }
}

/**
 * The downloaded FHE public key or CRS bytes don't match the digest
 * `KMSGeneration` recorded on-chain for that id. Terminal — never retried
 * automatically, since a mismatch may indicate compromised key material.
 */
export class KeyDigestMismatchError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.KeyDigestMismatch, message, options);
    this.name = "KeyDigestMismatchError";
  }
}
