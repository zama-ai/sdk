import { ZamaError, ZamaErrorCode } from "./base";

/** FHE encryption failed. */
export class EncryptionFailedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.EncryptionFailed, message, options);
    this.name = "EncryptionFailedError";
  }
}

/** FHE decryption failed. */
export class DecryptionFailedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.DecryptionFailed, message, options);
    this.name = "DecryptionFailedError";
  }
}
