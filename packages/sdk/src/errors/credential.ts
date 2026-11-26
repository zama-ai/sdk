import { isUnsupportedUnifiedPermitMessage } from "../utils/error";
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

/**
 * The permit's KMS context has been revoked on-chain, so the permit (and every
 * other permit signed under that context) is permanently unusable. The SDK
 * already tried to self-heal before surfacing this. Check `cause` to tell why
 * it failed: a `SigningFailedError` means the configured signer could not
 * produce a new permit, waiting will not help, establish a new permit with a
 * working signer. Any other cause means the retry hit the same revoked
 * context, typically because the upstream validity check caches a stale
 * "valid" verdict for up to 15 minutes; wait out that window and retry.
 */
export class RevokedKmsContextError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.RevokedKmsContext, message, options);
    this.name = "RevokedKmsContextError";
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

/**
 * The transport key pair changed between `preparePermit` and `registerPermit`
 * (expired, evicted, or rotated in between). The prepared EIP-712 payload was
 * signed against the old key pair's public key — registering it under a
 * different one would persist a permit bound to the wrong key. Call
 * `preparePermit` again to rebind the signature request to the current key pair.
 */
export class TransportKeyPairChangedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.TransportKeyPairChanged, message, options);
    this.name = "TransportKeyPairChangedError";
  }
}

/**
 * A prepared permit's `chainId` doesn't match the chain `registerPermit` is
 * running against. The EIP-712 payload's domain is bound to the chain it was
 * prepared for; registering it under a different chain would persist a permit
 * whose signed payload disagrees with its storage scope.
 */
export class PreparedPermitChainMismatchError extends ZamaError {
  /** Chain ID the permit was prepared for. */
  readonly preparedChainId: number;
  /** Chain ID `registerPermit` is currently running against. */
  readonly activeChainId: number;

  constructor(
    { preparedChainId, activeChainId }: { preparedChainId: number; activeChainId: number },
    options?: ErrorOptions,
  ) {
    super(
      ZamaErrorCode.PreparedPermitChainMismatch,
      `registerPermit: prepared.chainId (${preparedChainId}) does not match the active chain ` +
        `(${activeChainId}). Register the permit while the SDK is configured for the chain it was prepared for.`,
      options,
    );
    this.name = "PreparedPermitChainMismatchError";
    this.preparedChainId = preparedChainId;
    this.activeChainId = activeChainId;
  }
}

/** A prepared permit's validity window elapsed before its signature was registered. */
export class PreparedPermitExpiredError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.PreparedPermitExpired, message, options);
    this.name = "PreparedPermitExpiredError";
  }
}

/**
 * A V2 (unified) decryption permit can't be signed on the connected chain: it
 * isn't on protocol v0.14+, its `protocolConfigContractAddress` isn't set, or
 * its relayer lacks unified decryption support. A {@link WILDCARD_PERMIT}
 * request fails before any wallet prompt; a contract-list request falls back
 * to V1 unless the chain turns out not to be on protocol v0.14+. When the
 * `protocolConfigContractAddress` or relayer support is missing, request an
 * explicit contract list instead of a wildcard; on a chain not yet on v0.14+,
 * retry once it upgrades.
 */
export class UnifiedPermitNotSupportedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.UnifiedPermitNotSupported, message, options);
    this.name = "UnifiedPermitNotSupportedError";
  }
}

type UnifiedPermitOperation = "grantPermit" | "grantDelegationPermit" | "preparePermit";

/**
 * A {@link WILDCARD_PERMIT} request on a network where V2 permits are off: no
 * `protocolConfigContractAddress`, or the relayer doesn't report unified decryption support.
 *
 * @param op Which public entry point is rejecting the request.
 */
export function wildcardPermitNotSupportedError(
  op: UnifiedPermitOperation,
): UnifiedPermitNotSupportedError {
  return new UnifiedPermitNotSupportedError(
    `${op}: this network can't sign V2 (unified) permits because its FheChain has no ` +
      "protocolConfigContractAddress or its relayer doesn't report unified decryption " +
      `support. Call ${op} with an explicit contract list instead of WILDCARD_PERMIT; ` +
      "the SDK signs a V1 permit.",
  );
}

/**
 * Converts the `@fhevm/sdk` "invalid extraData version" signal (raised while building a V2
 * payload on a chain not on protocol v0.14+) into a typed {@link UnifiedPermitNotSupportedError}.
 *
 * @param op Which public entry point is converting the error.
 * @returns The typed error, or `undefined` when `error` doesn't match so the
 *   caller can fall through to its own handling.
 */
export function toUnifiedPermitNotSupportedError(
  op: UnifiedPermitOperation,
  error: unknown,
): UnifiedPermitNotSupportedError | undefined {
  if (!(error instanceof Error) || !isUnsupportedUnifiedPermitMessage(error.message)) {
    return undefined;
  }
  return new UnifiedPermitNotSupportedError(
    `${op}: this chain isn't on protocol v0.14+ yet, so it can't use V2 (unified) permits. ` +
      "Retry once the network upgrades.",
    { cause: error },
  );
}

/**
 * A decrypt needs a stored V2 (unified) permit, but the connected relayer
 * hasn't deployed the `/v3/user-decrypt` route it requires. Revoke the permit
 * with `revokePermits`, then call `grantPermit` to sign a V1 permit, or retry
 * once the relayer upgrades.
 */
export class UnifiedDecryptionUnsupportedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.UnifiedDecryptionUnsupported, message, options);
    this.name = "UnifiedDecryptionUnsupportedError";
  }
}

/**
 * The requested invalidation cutoff was not strictly later than the account's
 * current one. The ACL only ever moves the cutoff forward, so re-sending the
 * same or an older timestamp always reverts.
 */
export class InvalidationTimestampTooLowError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.InvalidationTimestampTooLow, message, options);
    this.name = "InvalidationTimestampTooLowError";
  }
}

/**
 * The requested invalidation cutoff was in the future. The ACL refuses to
 * invalidate signatures that have not been produced yet.
 */
export class InvalidationTimestampInFutureError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.InvalidationTimestampInFuture, message, options);
    this.name = "InvalidationTimestampInFutureError";
  }
}
