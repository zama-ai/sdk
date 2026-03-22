import { ZamaError, ZamaErrorCode } from "./base";

/** FHE keypair has expired and needs regeneration. */
export class KeypairExpiredError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.KeypairExpired, message, options);
    this.name = "KeypairExpiredError";
  }
}

/** Relayer rejected FHE keypair (stale, expired, or malformed). */
export class InvalidKeypairError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.InvalidKeypair, message, options);
    this.name = "InvalidKeypairError";
  }
}

/** No FHE ciphertext exists for this account (never shielded). */
export class NoCiphertextError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.NoCiphertext, message, options);
    this.name = "NoCiphertextError";
  }
}
