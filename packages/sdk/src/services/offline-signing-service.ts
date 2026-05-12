import type { Address, Hex } from "viem";
import { confidentialTransferContract } from "../contracts";
import type { CredentialService } from "../credentials/credential-service";
import {
  ChainMismatchError,
  ConfigurationError,
  EncryptionFailedError,
  TransactionRevertedError,
  ZamaError,
} from "../errors";
import type { TransactionErrorOperation, ZamaSDKEventInput } from "../events/sdk-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { EncryptionService } from "./encryption-service";
import { assertSignTransaction } from "../signer/capabilities";
import type {
  ConfidentialTransferRequest,
  CredentialPermitRequest,
  ExecuteRequest,
  GenericProvider,
  GenericSigner,
  PreparedTransaction,
  TransactionKind,
  TransactionPrepareRequest,
  TransactionResult,
} from "../types";
import { toError } from "../utils";

/** Configuration for {@link OfflineSigningService}. */
export interface OfflineSigningServiceConfig {
  readonly signer: GenericSigner;
  readonly provider: GenericProvider;
  readonly encryption: EncryptionService;
  readonly credentials: CredentialService;
  readonly emitEvent: (input: ZamaSDKEventInput, tokenAddress?: Address) => void;
}

/**
 * Optional behaviour overrides shared by every {@link OfflineSigningService}
 * method. Reserved for Phase 3+ extensions (custom nonces, fee overrides,
 * idempotency keys). Phase 2 only honours `signal`.
 */
export interface OfflineSigningOptions {
  readonly signal?: AbortSignal;
}

const SUBMITTED_EVENT_BY_KIND: Record<TransactionKind, ZamaSDKEventInput["type"]> = {
  ConfidentialTransfer: ZamaSDKEvents.TransferSubmitted,
};

const ERROR_OPERATION_BY_KIND: Record<TransactionKind, TransactionErrorOperation> = {
  ConfidentialTransfer: "transfer",
};

/**
 * Deferred-signing pipeline for SDK-75 — separates `prepare`, `sign`, and
 * `broadcast` for institutional custody and policy-engine workflows where
 * the three phases cannot run synchronously in a single Promise.
 *
 * Atomic call sites (`Token.confidentialTransfer`, etc.) keep their
 * `signer.writeContract` path; this service is the parallel route for
 * signers that expose `signTransaction` instead.
 *
 * Owned by {@link ZamaSDK}. Public methods are forwarded as
 * `sdk.prepare` / `sdk.sign` / `sdk.broadcast` / `sdk.execute` /
 * `sdk.completeFromTxHash`.
 *
 * @internal
 */
export class OfflineSigningService {
  readonly #signer: GenericSigner;
  readonly #provider: GenericProvider;
  readonly #encryption: EncryptionService;
  readonly #credentials: CredentialService;
  readonly #emitEvent: (input: ZamaSDKEventInput, tokenAddress?: Address) => void;

  constructor(config: OfflineSigningServiceConfig) {
    this.#signer = config.signer;
    this.#provider = config.provider;
    this.#encryption = config.encryption;
    this.#credentials = config.credentials;
    this.#emitEvent = config.emitEvent;
  }

  // ── prepare ─────────────────────────────────────────────────────────────

  /**
   * Build an RLP-encoded unsigned transaction for the given request. The
   * caller signs it externally (via {@link sign}, an HSM, or any
   * out-of-process signer) and feeds the result back through
   * {@link broadcast} or {@link execute}.
   */
  async prepare<K extends TransactionKind>(
    request: Extract<TransactionPrepareRequest, { kind: K }>,
    _options?: OfflineSigningOptions,
  ): Promise<PreparedTransaction<K>> {
    const from = await this.#requireAlignedFrom(`prepare(${request.kind})`);
    const call = await this.#buildCall(request, from);
    const unsignedTx = await this.#provider.prepareTransaction({ from, call });
    const chainId = await this.#provider.getChainId();
    return {
      kind: request.kind,
      request: request as Extract<TransactionPrepareRequest, { kind: K }>,
      unsignedTx,
      from,
      to: call.address,
      chainId,
    };
  }

  // ── sign ────────────────────────────────────────────────────────────────

  /**
   * Sign a prepared transaction with the configured signer and return
   * RLP-encoded signed bytes. Pair with {@link broadcast}, or use
   * {@link execute} for the bundled flow.
   *
   * @throws {@link SignerCapabilityError} when the configured signer has no
   *   `signTransaction` capability (online-only wallets).
   */
  async sign(prepared: PreparedTransaction, _options?: OfflineSigningOptions): Promise<Hex> {
    assertSignTransaction(this.#signer, `sign(${prepared.kind})`);
    return this.#signer.signTransaction(prepared.unsignedTx);
  }

  // ── broadcast ───────────────────────────────────────────────────────────

  /**
   * Submit a previously-signed transaction, await its receipt, emit the
   * matching `*Submitted` event, and return the {@link TransactionResult}.
   */
  async broadcast(
    prepared: PreparedTransaction,
    signedTx: Hex,
    _options?: OfflineSigningOptions,
  ): Promise<TransactionResult> {
    try {
      const txHash = await this.#provider.sendRawTransaction(signedTx);
      this.#emitSubmitted(prepared, txHash);
      const receipt = await this.#provider.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.#emitTransactionError(prepared, error);
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError(`Broadcast failed for ${prepared.kind}`, { cause: error });
    }
  }

  // ── execute (overloaded) ───────────────────────────────────────────────

  /**
   * Bundled in-process flow: takes a {@link PreparedTransaction} (sign +
   * broadcast), a {@link TransactionPrepareRequest} (prepare + sign +
   * broadcast), or a {@link CredentialPermitRequest} (atomic permit via
   * {@link CredentialService.allow}).
   */
  execute<K extends TransactionKind>(
    input: PreparedTransaction<K>,
    options?: OfflineSigningOptions,
  ): Promise<TransactionResult>;
  execute(
    input: TransactionPrepareRequest,
    options?: OfflineSigningOptions,
  ): Promise<TransactionResult>;
  execute(input: CredentialPermitRequest, options?: OfflineSigningOptions): Promise<void>;
  async execute(
    input: PreparedTransaction | ExecuteRequest,
    options?: OfflineSigningOptions,
  ): Promise<TransactionResult | void> {
    if (isPreparedTransaction(input)) {
      const signedTx = await this.sign(input, options);
      return this.broadcast(input, signedTx, options);
    }
    if (input.kind === "CredentialPermit") {
      await this.#credentials.allow(input.contracts, input.delegator);
      return;
    }
    const prepared = await this.prepare(input, options);
    const signedTx = await this.sign(prepared, options);
    return this.broadcast(prepared, signedTx, options);
  }

  // ── completeFromTxHash ─────────────────────────────────────────────────

  /**
   * Cache-sync escape hatch for the SDK-less broadcast path. Use when an
   * external process submitted `prepared.unsignedTx` directly via
   * `eth_sendRawTransaction` and this process needs to refresh its caches
   * without holding the signed bytes.
   */
  async completeFromTxHash(
    prepared: PreparedTransaction,
    txHash: Hex,
    _options?: OfflineSigningOptions,
  ): Promise<TransactionResult> {
    this.#emitSubmitted(prepared, txHash);
    const receipt = await this.#provider.waitForTransactionReceipt(txHash);
    return { txHash, receipt };
  }

  // ── internals ──────────────────────────────────────────────────────────

  async #buildCall<K extends TransactionKind>(
    request: Extract<TransactionPrepareRequest, { kind: K }>,
    from: Address,
  ): Promise<{
    readonly address: Address;
    readonly abi: readonly unknown[];
    readonly functionName: string;
    readonly args: readonly unknown[];
  }> {
    switch (request.kind) {
      case "ConfidentialTransfer":
        return this.#buildConfidentialTransfer(request, from);
      default: {
        const _exhaustive: never = request.kind;
        throw new ConfigurationError(
          `OfflineSigningService.prepare: unsupported transaction kind '${_exhaustive as string}'. ` +
            "Phase 2 ships ConfidentialTransfer only; other kinds land in Phase 3.",
        );
      }
    }
  }

  async #buildConfidentialTransfer(
    request: ConfidentialTransferRequest,
    from: Address,
  ): Promise<ReturnType<typeof confidentialTransferContract>> {
    const { handles, inputProof } = await this.#encryption.encrypt({
      values: [{ value: request.amount, type: "euint64" }],
      contractAddress: request.token,
      userAddress: from,
    });
    const handle = handles[0];
    if (!handle) {
      throw new EncryptionFailedError("Encryption returned no handles for ConfidentialTransfer");
    }
    return confidentialTransferContract(request.token, request.to, handle, inputProof);
  }

  async #requireAlignedFrom(operation: string): Promise<Address> {
    const account = this.#signer.requireWalletAccount(operation);
    const providerChainId = await this.#provider.getChainId();
    if (account.chainId !== providerChainId) {
      throw new ChainMismatchError({
        operation,
        signerChainId: account.chainId,
        providerChainId,
      });
    }
    return account.address;
  }

  #emitSubmitted(prepared: PreparedTransaction, txHash: Hex): void {
    const type = SUBMITTED_EVENT_BY_KIND[prepared.kind];
    this.#emitEvent({ type, txHash } as ZamaSDKEventInput, prepared.to);
  }

  #emitTransactionError(prepared: PreparedTransaction, error: unknown): void {
    this.#emitEvent(
      {
        type: ZamaSDKEvents.TransactionError,
        operation: ERROR_OPERATION_BY_KIND[prepared.kind],
        error: toError(error),
      },
      prepared.to,
    );
  }
}

function isPreparedTransaction(value: unknown): value is PreparedTransaction {
  return (
    typeof value === "object" &&
    value !== null &&
    "unsignedTx" in value &&
    "request" in value &&
    "from" in value
  );
}
