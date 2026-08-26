import type { CredentialService } from "../credentials/credential-service";
import type { PreparedPermit, PreparePermitRequest } from "../credentials/types";
import type { OfflineService } from "../services/offline-service";
import type {
  PreparedFor,
  PrepareOptions,
  PrepareTransactionRequest,
  TransactionKind,
} from "../types";

/**
 * Namespace for the offline-signing pipeline —
 * `prepare → [external sign + self-publish]` — for institutional custody, HSM
 * ceremonies, and policy-engine workflows where signing runs out-of-process and
 * cannot happen synchronously in a single Promise.
 */
export class Offline {
  readonly #offlineService: OfflineService;
  readonly #credentialService: CredentialService;

  /** @internal */
  constructor(offlineService: OfflineService, credentialService: CredentialService) {
    this.#offlineService = offlineService;
    this.#credentialService = credentialService;
  }

  /**
   * Build an RLP-encoded unsigned transaction for the given request. The
   * caller signs it externally — via an HSM ceremony, an out-of-process
   * custodian, or any signer holding the key — and broadcasts the signed bytes
   * through its own channel.
   *
   * Signer-optional: works without a configured signer (canonical shape for
   * cross-process custody — the back-end signer service consumes
   * `prepared.unsignedTx` and returns signed bytes).
   *
   * @remarks
   * `request.from` is only a declaration — the SDK does not prove the caller
   * controls it, and an EIP-1559 unsigned tx carries no `from` field at all
   * (the on-chain sender is whichever key signs the bytes). Point `from` at
   * the account the custodian will sign with; custodians enforce key-control
   * at sign time — a signing request for a key the credential can't use fails
   * there — so a mismatched `from` cannot make the custodian sign from an
   * account you don't control. Verifying control of `from` up front is still
   * the application's responsibility.
   */
  prepare<K extends TransactionKind>(
    request: Extract<PrepareTransactionRequest, { kind: K }>,
    options?: PrepareOptions,
  ): Promise<PreparedFor<K>> {
    return this.#offlineService.prepare(request, options);
  }

  /**
   * Build the offline-signing payload for a decryption permit: the unsigned
   * EIP-712 typed data plus everything `sdk.permits.registerPermit` needs to
   * verify and persist the signature an out-of-process signer returns for it.
   *
   * Not a `prepare()` transaction kind: a permit is not a transaction —
   * nothing is broadcast, and registering the signature is a local operation,
   * not a relayer round-trip.
   *
   * Signer-optional, like {@link prepare}: `request.signer` is an explicit
   * address, not a connected wallet account. Building the typed data still
   * reads the chain's KMS signers context on-chain — signer-offline, not
   * network-offline.
   *
   * One permit per call: unlike `sdk.permits.grantPermit`, this never widens
   * an existing permit or chunks over 10 contracts — `request.contracts` maps
   * to exactly one signature.
   *
   * @throws if `request.contracts` is empty or exceeds 10 addresses, `request.delegator`
   *   equals `request.signer`, or `request.durationDays` exceeds the V1 permit maximum
   *   of 365 days. {@link ConfigurationError}
   * @throws if a concurrent `permits.revokeTransportKeyPair()` rotates the transport key
   *   pair while this call is generating one. {@link TransportKeyPairChangedError}
   */
  preparePermit(request: PreparePermitRequest): Promise<PreparedPermit> {
    return this.#credentialService.preparePermit(request);
  }
}
