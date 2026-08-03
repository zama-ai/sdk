import type { OfflineOptions, OfflineService } from "../services/offline-service";
import type { PreparedFor, PrepareTransactionRequest, TransactionKind } from "../types";

/**
 * Namespace for the offline-signing pipeline —
 * `prepare → [external sign + self-publish]` — for institutional custody, HSM
 * ceremonies, and policy-engine workflows where signing runs out-of-process and
 * cannot happen synchronously in a single Promise.
 */
export class Offline {
  readonly #offlineService: OfflineService;

  /** @internal */
  constructor(offlineService: OfflineService) {
    this.#offlineService = offlineService;
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
    options?: OfflineOptions,
  ): Promise<PreparedFor<K>> {
    return this.#offlineService.prepare(request, options);
  }
}
