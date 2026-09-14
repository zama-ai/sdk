import { ZamaError, ZamaErrorCode } from "./base";

/** FHE encryption failed. */
export class EncryptionFailedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.EncryptionFailed, message, options);
    this.name = "EncryptionFailedError";
  }
}

/**
 * Encryption offload was required but the worker could not be used.
 *
 * Only `web({ offloadEncrypt: true })` throws this: the strict mode refuses to
 * silently finish the operation on the calling thread. With `"auto"` the same
 * conditions warn and fall back instead.
 */
export class EncryptOffloadUnavailableError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.EncryptOffloadUnavailable, message, options);
    this.name = "EncryptOffloadUnavailableError";
  }
}

/** FHE decryption failed. */
export class DecryptionFailedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.DecryptionFailed, message, options);
    this.name = "DecryptionFailedError";
  }
}
