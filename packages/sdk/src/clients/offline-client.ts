import type { Hex } from "viem";
import type {
  OfflineSigningOptions,
  OfflineSigningService,
} from "../services/offline-signing-service";
import type {
  CredentialPermitRequest,
  CredentialPermitResult,
  PermitKind,
  PreparedFor,
  PreparedPermitFor,
  PreparedTransaction,
  TransactionKind,
  TransactionPrepareRequest,
  TransactionResult,
} from "../types";

/**
 * Sub-client for the offline-signing pipeline — `prepare → sign → broadcast`
 * decomposed for institutional custody, HSM ceremonies, and policy-engine
 * workflows where the three steps cannot run synchronously in a single
 * Promise.
 *
 * Three tiers — the industry-standard shape custody platforms expose
 * (transfer / sign-and-broadcast / sign-only):
 * - **Tier 1 — atomic** ({@link Token} methods like `Token.confidentialTransfer`) — *not* on this client; lives on `Token` for online-signer call sites.
 * - **Tier 2 — sign & broadcast (or sign & register) bundled** ({@link signAndBroadcast} / {@link signAndRegister}) — one in-process call, three steps internally.
 * - **Tier 3 — fully decomposed** ({@link prepare} / {@link sign} / {@link broadcast}) — caller slots their own custody steps between SDK calls.
 *
 * Obtained via `sdk.offline`. "Offline" refers to where the signer's keys
 * live (out-of-process: HSM, custody control plane, policy engine), not to
 * the methods themselves — {@link broadcast}, {@link signAndBroadcast}, and
 * {@link refresh} are RPC-bound. The SDK never takes custody of
 * signing material; every method that signs runs against the signer object
 * you passed to `createConfig`, in your process; keys stay where they are.
 */
export class OfflineClient {
  readonly #offlineSigningService: OfflineSigningService;

  constructor(offlineSigningService: OfflineSigningService) {
    this.#offlineSigningService = offlineSigningService;
  }

  /**
   * Build an RLP-encoded unsigned transaction for the given request. The
   * caller signs it externally — via {@link sign}, an HSM ceremony, an
   * out-of-process custodian — and feeds the result back into
   * {@link broadcast} or {@link signAndBroadcast}.
   *
   * Signer-optional: works without a configured signer (canonical shape for
   * cross-process custody — the back-end signer service consumes
   * `prepared.unsignedTx` and returns signed bytes).
   *
   * @throws {@link SignerAddressMismatchError} if a signer IS configured and
   *   its connected wallet address differs from `request.from`.
   * @throws {@link ChainMismatchError} if a signer IS configured and its
   *   chain disagrees with the provider's chain.
   */
  prepare<K extends TransactionKind>(
    request: Extract<TransactionPrepareRequest, { kind: K }>,
    options?: OfflineSigningOptions,
  ): Promise<PreparedFor<K>>;
  prepare<K extends PermitKind>(
    request: CredentialPermitRequest,
    options?: OfflineSigningOptions,
  ): Promise<PreparedPermitFor<K>>;
  prepare(
    request: TransactionPrepareRequest | CredentialPermitRequest,
    options?: OfflineSigningOptions,
  ): Promise<PreparedTransaction | PreparedPermitFor<PermitKind>> {
    return this.#offlineSigningService.prepare(request as never, options);
  }

  /**
   * **In-process convenience** that delegates to
   * `this.signer.signTransaction(prepared.unsignedTx)` with capability checks
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
   *   but not full transactions): use the signer for {@link registerPermit}
   *   flows; for tx-signing, arrange an out-of-process pipeline bypassing
   *   this method. `sign()` throws {@link SignerCapabilityError} here.
   *
   * Both cases naturally route to `prepare → external sign → broadcast`
   * — this method is the convenience for the third case where the configured
   * signer holds the key and can sign in-process.
   *
   * @throws {@link SignerNotConfiguredError} no signer configured
   * @throws {@link SignerCapabilityError} signer lacks `signTransaction`
   * @throws {@link SigningFailedError} signer rejected (HSM denial, policy
   *   refusal, timeout, …)
   */
  sign(prepared: PreparedTransaction): Promise<Hex> {
    return this.#offlineSigningService.sign(prepared);
  }

  /**
   * Submit a previously-signed transaction, await its receipt, emit the
   * matching `*Submitted` event, and return the {@link TransactionResult}.
   */
  broadcast(prepared: PreparedTransaction, signedTx: Hex): Promise<TransactionResult> {
    return this.#offlineSigningService.broadcast(prepared, signedTx);
  }

  /**
   * Bundled in-process flow for a transaction: prepare + sign + broadcast.
   * Equivalent to chaining `await broadcast(prepared, await sign(prepared))`
   * for callers who already hold a prepared transaction.
   *
   * Tier-2 of the offline-signing surface — equivalent to the
   * "sign-and-broadcast" entry point custody platforms typically expose
   * alongside their lower-level sign-only API.
   */
  signAndBroadcast(
    request: TransactionPrepareRequest,
    options?: OfflineSigningOptions,
  ): Promise<TransactionResult> {
    return this.#offlineSigningService.signAndBroadcast(request, options);
  }

  /**
   * Bundled in-process flow for a credential permit: prepare + signTypedData
   * + register. Returns the registered permit metadata, or `void` when the
   * permit was already cached and no signature was needed.
   */
  signAndRegister(request: CredentialPermitRequest): Promise<CredentialPermitResult | void> {
    return this.#offlineSigningService.signAndRegister(request);
  }

  /**
   * Persist an externally-signed credential permit. Pair with
   * `sdk.offline.prepare({ kind: "CredentialPermit", from, contracts })` and an
   * external `signTypedData` call over `prepared.typedData`.
   *
   * Signer-optional: works without a configured signer.
   */
  registerPermit<K extends PermitKind>(
    prepared: PreparedPermitFor<K>,
    signature: Hex,
  ): Promise<CredentialPermitResult> {
    return this.#offlineSigningService.registerPermit(prepared, signature);
  }

  /**
   * Resume the SDK lifecycle for an externally-broadcast transaction: wait
   * for its receipt, emit the matching `*Submitted` event, and sync cache
   * state — without holding the signed bytes. Pair with {@link prepare} when
   * the broadcast happens in a custody control plane or via
   * `eth_sendRawTransaction` outside this process.
   */
  resume(prepared: PreparedTransaction, txHash: Hex): Promise<TransactionResult> {
    return this.#offlineSigningService.resume(prepared, txHash);
  }

  /**
   * Re-stamp a prepared transaction with the current chain state — fresh
   * nonce, fee parameters, and gas limit. Call this before {@link sign}
   * when the gap since {@link prepare} was long enough for values to drift
   * (custodian approval ceremonies, multi-party signing, etc.). The
   * original `prepared` is left untouched (immutable).
   *
   * Signer-optional: works without a configured signer.
   */
  refresh<K extends TransactionKind>(
    prepared: PreparedFor<K>,
    options?: OfflineSigningOptions,
  ): Promise<PreparedFor<K>> {
    return this.#offlineSigningService.refresh(prepared, options);
  }
}
