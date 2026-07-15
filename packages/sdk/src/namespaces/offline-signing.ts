import type { Hex } from "viem";
import type {
  OfflineSigningOptions,
  OfflineSigningService,
} from "../services/offline-signing-service";
import type {
  PreparedFor,
  PreparedTransaction,
  PrepareTransactionRequest,
  TransactionKind,
  TransactionResult,
} from "../types";

/**
 * Namespace for the offline-signing pipeline — `prepare → sign → broadcast`
 * decomposed for institutional custody, HSM ceremonies, and policy-engine
 * workflows where the three steps cannot run synchronously in a single
 * Promise.
 *
 * Two surfaces, picked by where the signer's keys live:
 * - **In-process atomic** ({@link Token} methods like `Token.confidentialTransfer`) — *not* on this client; lives on `Token` for online-signer call sites where prepare/sign/broadcast can run synchronously.
 * - **Decomposed** ({@link prepare} / {@link sign} / {@link broadcast}) — caller slots their own custody steps between SDK calls. This namespace.
 *
 * This pipeline is **transaction-only**: {@link prepare} returns an
 * RLP-encoded unsigned EIP-1559 tx, finalized with {@link broadcast} (you hold
 * the signed bytes) or {@link resume} (a custodian broadcast it), yielding a
 * {@link TransactionResult}. Decryption permits are *not* transactions — they
 * are signed credentials with no broadcast step — so they are acquired through
 * `sdk.permits.grantPermit` instead, which signs with whatever signer you
 * configured (including an out-of-process custody signer whose `signTypedData`
 * resolves when the HSM/policy engine returns).
 *
 * Obtained via `sdk.offlineSigning`. "Offline" refers to where the signer's
 * keys live (out-of-process: HSM, custody control plane, policy engine), not
 * to the methods themselves — {@link broadcast} and {@link refresh} are
 * RPC-bound. The SDK never takes custody of signing material; every method
 * that signs runs against the signer object you passed to `createConfig`,
 * in your process; keys stay where they are.
 */
export class OfflineSigning {
  readonly #offlineSigningService: OfflineSigningService;

  constructor(offlineSigningService: OfflineSigningService) {
    this.#offlineSigningService = offlineSigningService;
  }

  /**
   * Build an RLP-encoded unsigned transaction for the given request. The
   * caller signs it externally — via {@link sign}, an HSM ceremony, an
   * out-of-process custodian — and feeds the result back into
   * {@link broadcast}.
   *
   * Signer-optional: works without a configured signer (canonical shape for
   * cross-process custody — the back-end signer service consumes
   * `prepared.unsignedTx` and returns signed bytes).
   *
   * @remarks
   * **`from` authority (signer-less path):** with no configured signer,
   * `request.from` is only a declaration — the SDK does not prove the caller
   * controls it, and an EIP-1559 unsigned tx carries no `from` field at all
   * (the on-chain sender is whichever key signs the bytes). Point `from` at
   * the account the custodian will sign with; custodians enforce key-control
   * at sign time — a signing request for a key the credential can't use fails
   * there — so a mismatched `from` cannot make the custodian sign from an
   * account you don't control. Verifying control of `from` up front is still
   * the application's responsibility.
   *
   * @throws if a signer IS configured and its connected wallet address differs
   *   from `request.from`. {@link SignerAddressMismatchError}
   * @throws if a signer IS configured and its chain disagrees with the
   *   provider's chain. {@link ChainMismatchError}
   */
  prepare<K extends TransactionKind>(
    request: Extract<PrepareTransactionRequest, { kind: K }>,
    options?: OfflineSigningOptions,
  ): Promise<PreparedFor<K>> {
    return this.#offlineSigningService.prepare(request, options);
  }

  /**
   * **In-process convenience** that delegates to
   * `this.signer.signTransaction(preparedTx.unsignedTx)` with capability checks
   * and event/error integration. The SDK never takes custody of signing
   * material — this method runs in your process, against the signer object
   * you passed to `createConfig`; keys stay where they are.
   *
   * Many flows skip this method:
   *
   * - **Cross-process custody** (institutional custodians, policy engines,
   *   m-of-n approval workflows): configure with `signer: undefined`, sign
   *   in your back-end signer service, pass bytes to {@link broadcast}.
   *   `sign()` throws {@link SignerNotConfiguredError} here — by design.
   * - **Permit-only signers** (KMS configurations that can `signTypedData`
   *   but not full transactions): for tx-signing, arrange an out-of-process
   *   pipeline bypassing this method. `sign()` throws
   *   {@link SignerCapabilityError} here. (Permits are signed via
   *   `sdk.permits.grantPermit`, which needs only `signTypedData`.)
   *
   * Both cases naturally route to `prepare → external sign → broadcast`
   * — this method is the convenience for the third case where the configured
   * signer holds the key and can sign in-process.
   *
   * @throws if no signer configured. {@link SignerNotConfiguredError}
   * @throws if signer lacks `signTransaction`. {@link SignerCapabilityError}
   * @throws if signer rejected (HSM denial, policy refusal, timeout, …).
   *   {@link SigningFailedError}
   */
  sign(preparedTx: PreparedTransaction): Promise<Hex> {
    return this.#offlineSigningService.sign(preparedTx);
  }

  /**
   * Submit a previously-signed transaction, await its receipt, emit the
   * matching `*Submitted` event, and return the {@link TransactionResult}.
   */
  broadcast(preparedTx: PreparedTransaction, signedTx: Hex): Promise<TransactionResult> {
    return this.#offlineSigningService.broadcast(preparedTx, signedTx);
  }

  /**
   * Resume the SDK lifecycle for an externally-broadcast transaction: wait
   * for its receipt, emit the matching `*Submitted` event, and sync cache
   * state — without holding the signed bytes. Pair with {@link prepare} when
   * the broadcast happens in a custody control plane or via
   * `eth_sendRawTransaction` outside this process.
   *
   * @remarks
   * **Trust model:** the SDK takes the caller's word that `txHash`
   * corresponds to `preparedTx.unsignedTx`. No on-chain check confirms that
   * the broadcaster signed *this* payload rather than a different one from
   * the same account. Callers who need a stronger guarantee can refetch the
   * tx via the provider and compare its serialized form.
   *
   * **Prefer {@link broadcast} wherever the custodian can return signed
   * bytes.** There the tx hash is `keccak256(signedTx)` — derived from the
   * exact bytes the SDK submits — so the payload↔hash binding holds with no
   * trust in the caller. `resume` exists for custodians that must broadcast
   * themselves (e.g. import-and-broadcast HSM ceremonies); it trades that
   * binding for the ability to rejoin the lifecycle from a hash alone.
   */
  resume(preparedTx: PreparedTransaction, txHash: Hex): Promise<TransactionResult> {
    return this.#offlineSigningService.resume(preparedTx, txHash);
  }

  /**
   * Re-stamp a prepared transaction with the current chain state — fresh
   * nonce, fee parameters, and gas limit. Call this before {@link sign}
   * when the gap since {@link prepare} was long enough for values to drift
   * (custodian approval ceremonies, multi-party signing, etc.). The
   * original `preparedTx` is left untouched (immutable).
   *
   * Signer-optional: works without a configured signer.
   *
   * @remarks
   * **Identity is not stable across refresh** — the returned `unsignedTx`
   * bytes (and therefore the eventual tx hash) differ from the input's.
   * Custodian policy engines typically key an approval by their own request
   * id (not by the payload bytes), so a refresh does not mutate a pending
   * approval: it is a *new* submission needing its own approval, and the
   * prior one stays pending until it expires or you explicitly cancel it.
   * Supersede by cancel-then-resubmit — a new request does not implicitly
   * replace the old one.
   *
   * **Air-gapped ceremonies:** once a payload is exported for offline signing
   * its bytes are frozen — nonce and fees live inside what gets signed and
   * cannot change after export, so `refresh` there means a *fresh export*,
   * not an in-place update. For hours-to-days signing gaps, pin generous
   * `maxFeePerGas` / `maxPriorityFeePerGas` bounds up front (via
   * {@link OfflineSigningOptions}) rather than relying on a late refresh.
   */
  refresh<K extends TransactionKind>(
    preparedTx: PreparedFor<K>,
    options?: OfflineSigningOptions,
  ): Promise<PreparedFor<K>> {
    return this.#offlineSigningService.refresh(preparedTx, options);
  }
}
