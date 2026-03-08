import { Data } from "effect";

export class EncryptionFailed extends Data.TaggedError("EncryptionFailed")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class DecryptionFailed extends Data.TaggedError("DecryptionFailed")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class SigningRejected extends Data.TaggedError("SigningRejected")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class SigningFailed extends Data.TaggedError("SigningFailed")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class TransactionReverted extends Data.TaggedError("TransactionReverted")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class ApprovalFailed extends Data.TaggedError("ApprovalFailed")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class RelayerRequestFailed extends Data.TaggedError("RelayerRequestFailed")<{
  readonly message: string;
  readonly statusCode?: number;
  readonly cause?: Error;
}> {}

export class NoCiphertext extends Data.TaggedError("NoCiphertext")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class KeypairExpired extends Data.TaggedError("KeypairExpired")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class InvalidKeypair extends Data.TaggedError("InvalidKeypair")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class ConfigurationFailed extends Data.TaggedError("ConfigurationFailed")<{
  readonly message: string;
}> {}

/** All errors that can originate from the relayer layer. */
export type RelayerError = EncryptionFailed | DecryptionFailed | RelayerRequestFailed;

/** All errors that can originate from token operations. */
export type TokenError =
  | RelayerError
  | SigningRejected
  | SigningFailed
  | TransactionReverted
  | ApprovalFailed
  | NoCiphertext
  | KeypairExpired
  | InvalidKeypair;
