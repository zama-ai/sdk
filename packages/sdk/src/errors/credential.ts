import { ZamaError, ZamaErrorCode } from "./base";

/** Transport key pair has expired and needs regeneration. */
export class TransportKeyPairExpiredError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.TransportKeyPairExpired, message, options);
    this.name = "TransportKeyPairExpiredError";
  }
}

/**
 * @deprecated Renamed to {@link TransportKeyPairExpiredError} to match the FHEVM glossary. The old
 *   name is kept as a public-API back-compat alias and will be removed before the 3.x stable release.
 */
export const KeypairExpiredError = TransportKeyPairExpiredError;
export type KeypairExpiredError = TransportKeyPairExpiredError;

/** Relayer rejected the transport key pair (stale, expired, or malformed). */
export class InvalidTransportKeyPairError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.InvalidTransportKeyPair, message, options);
    this.name = "InvalidTransportKeyPairError";
  }
}

/**
 * @deprecated Renamed to {@link InvalidTransportKeyPairError} to match the FHEVM glossary. The old
 *   name is kept as a public-API back-compat alias and will be removed before the 3.x stable release.
 */
export const InvalidKeypairError = InvalidTransportKeyPairError;
export type InvalidKeypairError = InvalidTransportKeyPairError;

/** No FHE ciphertext exists for this account (never shielded). */
export class NoCiphertextError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.NoCiphertext, message, options);
    this.name = "NoCiphertextError";
  }
}
