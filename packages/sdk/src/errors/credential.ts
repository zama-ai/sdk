import { ZamaError, ZamaErrorCode } from "./base";

/** Transport key pair has expired and needs regeneration. */
export class TransportKeyPairExpiredError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.TransportKeyPairExpired, message, options);
    this.name = "TransportKeyPairExpiredError";
  }
}

/** Relayer rejected the transport key pair (stale, expired, or malformed). */
export class InvalidTransportKeyPairError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.InvalidTransportKeyPair, message, options);
    this.name = "InvalidTransportKeyPairError";
  }
}

/** No FHE ciphertext exists for this account (never shielded). */
export class NoCiphertextError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.NoCiphertext, message, options);
    this.name = "NoCiphertextError";
  }
}

/**
 * Wrapping or unwrapping the transport private key with `transportKeyPairDerivationSecret` failed:
 * a scoped entry that fails to unwrap may belong to a peer using a different secret, so it fails
 * loudly instead of silently regenerating and clobbering that peer's entry, or the underlying
 * WebCrypto operation itself failed (e.g. `crypto.subtle` unavailable in this environment).
 */
export class KeyWrappingError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.KeyWrappingFailed, message, options);
    this.name = "KeyWrappingError";
  }
}
