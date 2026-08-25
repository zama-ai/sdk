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
 * The connected chain doesn't support V2 (unified) decryption permits yet —
 * including {@link WILDCARD_PERMIT} — because it hasn't upgraded to protocol
 * v0.14 or later. Thrown before any wallet prompt: the SDK detects this from
 * the chain's on-chain KMS context, without a signature attempt. V1 permits
 * (an explicit contract list, not `WILDCARD_PERMIT`) are unaffected — grant
 * one of those instead, or retry once the network upgrades.
 */
export class UnifiedPermitNotSupportedError extends ZamaError {
  constructor(message: string, options?: ErrorOptions) {
    super(ZamaErrorCode.UnifiedPermitNotSupported, message, options);
    this.name = "UnifiedPermitNotSupportedError";
  }
}
