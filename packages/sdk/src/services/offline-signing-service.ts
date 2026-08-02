import { getAddress, type Address, type Hex } from "viem";
import type { ChainRouter } from "../chains/router";
import {
  approveContract,
  confidentialBalanceOfContract,
  confidentialTransferContract,
  confidentialTransferFromContract,
  delegateForUserDecryptionContract,
  finalizeUnwrapContract,
  MAX_UINT48,
  MAX_UINT64,
  revokeDelegationContract,
  setOperatorContract,
  transferAndCallContract,
  unwrapContract,
  unwrapFromBalanceContract,
  wrapContract,
} from "../contracts";
import {
  ConfigurationError,
  EncryptionFailedError,
  PreparedChainMismatchError,
  TransactionRevertedError,
  wrapDecryptError,
  ZamaError,
} from "../errors";
import type { TransactionOperation, ZamaSDKEventInput } from "../events/sdk-events";
import { transactionOperationMetadata, ZamaSDKEvents } from "../events/sdk-events";
import type {
  ApproveUnderlyingRequest,
  ConfidentialTransferFromRequest,
  ConfidentialTransferRequest,
  DelegateDecryptionRequest,
  FinalizeUnwrapRequest,
  GenericProvider,
  GenericSigner,
  PreparedFor,
  PreparedTransaction,
  PrepareTransactionRequest,
  RevokeDelegationRequest,
  SetOperatorRequest,
  TransactionKind,
  TransactionResult,
  TransferAndCallRequest,
  UnwrapAllRequest,
  UnwrapRequest,
  WrapRequest,
} from "../types";
import { toError } from "../utils";
import { assertBigint } from "../utils/assertions";
import type { EncryptionService } from "./encryption-service";

/**
 * Configuration for {@link OfflineSigningService}.
 *
 * @internal
 */
export interface OfflineSigningServiceConfig {
  /**
   * Optional signer. `prepare` and `broadcast` work without a signer
   * (canonical shape for cross-process custody). When configured, `prepare`
   * asserts the signer's connected wallet matches `request.from`.
   */
  readonly signer?: GenericSigner;
  readonly provider: GenericProvider;
  readonly router: ChainRouter;
  readonly encryption: EncryptionService;
  readonly emitEvent: (input: ZamaSDKEventInput, tokenAddress?: Address) => void;
}

/**
 * Optional behaviour overrides shared by every {@link OfflineSigningService}
 * method.
 *
 * `nonce`, `maxFeePerGas`, `maxPriorityFeePerGas`, and `gasLimit` flow
 * through to {@link GenericProvider.prepareTransaction} so custodians with
 * their own nonce/fee managers can pin values at prepare time. Omitted
 * fields fall back to the provider's default (live chain state).
 *
 * The nonce and fees are part of the RLP that gets signed, so a custodian
 * that signs the bytes you hand it (rather than assembling the tx itself)
 * cannot fill or change them afterwards — own the `nonce` here when signing
 * through such a path. For long-latency ceremonies (air-gapped HSM signing,
 * slow multi-party approval) the signed payload is frozen once exported, so
 * pin generous fee bounds up front rather than expecting to re-stamp later.
 */
export interface OfflineSigningOptions {
  /** Optional {@link AbortSignal} to cancel the in-flight chain reads. */
  readonly signal?: AbortSignal;
  /** Override the nonce. Otherwise the provider reads `getTransactionCount("pending")`. */
  readonly nonce?: number;
  /** Override `maxFeePerGas`. Otherwise the provider reads `estimateFeesPerGas`. */
  readonly maxFeePerGas?: bigint;
  /** Override `maxPriorityFeePerGas`. Otherwise the provider reads `estimateFeesPerGas`. */
  readonly maxPriorityFeePerGas?: bigint;
  /** Override the gas limit. Otherwise the provider calls `estimateGas`. */
  readonly gasLimit?: bigint;
}

const ERROR_OPERATION_BY_KIND: Record<TransactionKind, TransactionOperation> = {
  ConfidentialTransfer: "transfer",
  ConfidentialTransferFrom: "transferFrom",
  SetOperator: "setOperator",
  Unwrap: "unwrap",
  UnwrapAll: "unwrap",
  FinalizeUnwrap: "finalizeUnwrap",
  ApproveUnderlying: "approveUnderlying",
  Wrap: "shield:approveAndWrap",
  TransferAndCall: "shield:transferAndCall",
  DelegateDecryption: "delegateDecryption",
  RevokeDelegation: "revokeDelegation",
};

/**
 * Offline-signing pipeline. Separates `prepare` and `broadcast` for
 * institutional custody and policy-engine workflows where signing runs
 * out-of-process and cannot happen synchronously in a single Promise.
 *
 * Atomic call sites ({@link Token.confidentialTransfer}, etc.) keep their
 * `signer.writeContract` path; this service is the parallel route where the
 * caller signs `prepared.unsignedTx` externally (HSM, custody API, policy
 * engine) and feeds the signed bytes back through {@link broadcast}.
 *
 * Owned by {@link ZamaSDK}.
 *
 * @internal
 */
export class OfflineSigningService {
  readonly #provider: GenericProvider;
  readonly #router: ChainRouter;
  readonly #encryption: EncryptionService;
  readonly #emitEvent: (input: ZamaSDKEventInput, tokenAddress?: Address) => void;

  constructor(config: OfflineSigningServiceConfig) {
    this.#provider = config.provider;
    this.#router = config.router;
    this.#encryption = config.encryption;
    this.#emitEvent = config.emitEvent;
  }

  // ── prepare ─────────────────────────────────────────────────────────────

  /**
   * Build the offline-signing payload for the given transaction request:
   * an RLP-encoded unsigned transaction the caller signs externally (an HSM,
   * custody API, or any out-of-process signer) and feeds back through
   * {@link broadcast}.
   *
   * Decryption permits are not transactions — acquire them via
   * `sdk.permits.grantPermit`, which signs with the configured signer
   * (including an out-of-process custody signer).
   */
  async prepare<K extends TransactionKind>(
    request: Extract<PrepareTransactionRequest, { kind: K }>,
    options?: OfflineSigningOptions,
  ): Promise<PreparedFor<K>> {
    const from = getAddress(request.from);
    const call = await this.#buildCall(request, from);
    const unsignedTx = await this.#provider.prepareTransaction({
      from,
      call,
      nonce: options?.nonce,
      maxFeePerGas: options?.maxFeePerGas,
      maxPriorityFeePerGas: options?.maxPriorityFeePerGas,
      gasLimit: options?.gasLimit,
    });
    const chainId = await this.#provider.getChainId();
    return {
      kind: request.kind,
      request,
      unsignedTx,
      from,
      to: call.address,
      chainId,
    } as PreparedFor<K>;
  }

  // ── broadcast ───────────────────────────────────────────────────────────

  /**
   * Submit a previously-signed transaction, await its receipt, emit the
   * matching `*Submitted` event, and return the {@link TransactionResult}.
   *
   * Re-checks chain alignment between `preparedTx.chainId` and the configured
   * provider before sending; a mismatch throws
   * {@link PreparedChainMismatchError} before any bytes leave the process.
   *
   * Post-chain-check errors are reported in two distinct shapes so subscribers
   * can recover: a pre-submit RPC reject is wrapped as
   * `TransactionRevertedError("Broadcast failed for …")`; a post-submit failure
   * (receipt wait timeout or revert) preserves `txHash` in the message so the
   * caller can recover by re-querying that transaction.
   */
  async broadcast(preparedTx: PreparedTransaction, signedTx: Hex): Promise<TransactionResult> {
    await this.#assertSameChainAsPrepared(preparedTx, "broadcast");
    let txHash: Hex;
    try {
      txHash = await this.#provider.sendRawTransaction(signedTx);
    } catch (error) {
      this.#emitTransactionError(preparedTx, error);
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError(`Broadcast failed for ${preparedTx.kind}`, {
        cause: error,
      });
    }
    this.#emitSubmitted(preparedTx, txHash);
    return this.#awaitReceipt(preparedTx, txHash);
  }

  // ── internals ──────────────────────────────────────────────────────────

  async #buildCall(
    request: PrepareTransactionRequest,
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
      case "ConfidentialTransferFrom":
        return this.#buildConfidentialTransferFrom(request);
      case "SetOperator":
        return this.#buildSetOperator(request);
      case "Unwrap":
        return this.#buildUnwrap(request, from);
      case "UnwrapAll":
        return this.#buildUnwrapAll(request, from);
      case "FinalizeUnwrap":
        return this.#buildFinalizeUnwrap(request);
      case "ApproveUnderlying":
        return this.#buildApproveUnderlying(request);
      case "Wrap":
        return this.#buildWrap(request);
      case "TransferAndCall":
        return this.#buildTransferAndCall(request);
      case "DelegateDecryption":
        return this.#buildDelegateDecryption(request);
      case "RevokeDelegation":
        return this.#buildRevokeDelegation(request);
      default: {
        const unhandled: { kind: string } = request;
        throw new ConfigurationError(
          `OfflineSigningService.prepare: unsupported transaction kind '${unhandled.kind}'.`,
        );
      }
    }
  }

  async #buildConfidentialTransfer(
    request: ConfidentialTransferRequest,
    from: Address,
  ): Promise<ReturnType<typeof confidentialTransferContract>> {
    const { encryptedValues, inputProof } = await this.#encryption.encryptValues({
      values: [{ value: request.amount, type: "euint64" }],
      contractAddress: request.token,
      userAddress: from,
    });
    const handle = encryptedValues[0];
    if (!handle) {
      throw new EncryptionFailedError("Encryption returned no handles for ConfidentialTransfer");
    }
    return confidentialTransferContract(request.token, request.to, handle, inputProof);
  }

  async #buildConfidentialTransferFrom(
    request: ConfidentialTransferFromRequest,
  ): Promise<ReturnType<typeof confidentialTransferFromContract>> {
    const { encryptedValues, inputProof } = await this.#encryption.encryptValues({
      values: [{ value: request.amount, type: "euint64" }],
      contractAddress: request.token,
      userAddress: getAddress(request.owner),
    });
    const handle = encryptedValues[0];
    if (!handle) {
      throw new EncryptionFailedError(
        "Encryption returned no handles for ConfidentialTransferFrom",
      );
    }
    return confidentialTransferFromContract(
      request.token,
      getAddress(request.owner),
      getAddress(request.to),
      handle,
      inputProof,
    );
  }

  #buildSetOperator(request: SetOperatorRequest): ReturnType<typeof setOperatorContract> {
    // Offline payloads are frozen at prepare time, so an omitted `until` must
    // mean "permanent" (uint48 max) — never a relative default like the atomic
    // path's now + 1h, which would silently expire mid-ceremony. Mirrors the
    // MAX_UINT64 sentinel `#buildDelegateDecryption` uses for the same reason.
    return setOperatorContract(
      request.token,
      getAddress(request.operator),
      request.until ?? MAX_UINT48,
    );
  }

  async #buildUnwrap(
    request: UnwrapRequest,
    from: Address,
  ): Promise<ReturnType<typeof unwrapContract>> {
    const { encryptedValues, inputProof } = await this.#encryption.encryptValues({
      values: [{ value: request.amount, type: "euint64" }],
      contractAddress: request.token,
      userAddress: from,
    });
    const handle = encryptedValues[0];
    if (!handle) {
      throw new EncryptionFailedError("Encryption returned no handles for Unwrap");
    }
    return unwrapContract(request.token, from, getAddress(request.to), handle, inputProof);
  }

  async #buildUnwrapAll(
    request: UnwrapAllRequest,
    from: Address,
  ): Promise<ReturnType<typeof unwrapFromBalanceContract>> {
    const balanceHandle = await this.#provider.readContract(
      confidentialBalanceOfContract(request.token, from),
    );
    return unwrapFromBalanceContract(request.token, from, getAddress(request.to), balanceHandle);
  }

  async #buildFinalizeUnwrap(
    request: FinalizeUnwrapRequest,
  ): Promise<ReturnType<typeof finalizeUnwrapContract>> {
    const decrypted = await this.#router.relayer
      .decryptPublicValuesWithSignatures({ encryptedValues: [request.unwrapRequestIdOrAmount] })
      .catch((error: unknown) => {
        throw wrapDecryptError(error, "Public decryption failed during FinalizeUnwrap");
      });
    const raw = decrypted.clearValues[0]?.value;
    assertBigint(raw, "FinalizeUnwrap: decryptPublicValuesWithSignatures(handle).clearValue");
    return finalizeUnwrapContract(
      request.wrapper,
      request.unwrapRequestIdOrAmount,
      raw,
      decrypted.checkSignaturesArgs.decryptionProof,
    );
  }

  #buildApproveUnderlying(request: ApproveUnderlyingRequest): ReturnType<typeof approveContract> {
    return approveContract(request.underlying, request.spender, request.amount);
  }

  #buildWrap(request: WrapRequest): ReturnType<typeof wrapContract> {
    return wrapContract(request.wrapper, getAddress(request.to), request.amount);
  }

  #buildTransferAndCall(
    request: TransferAndCallRequest,
  ): ReturnType<typeof transferAndCallContract> {
    return transferAndCallContract(
      request.underlying,
      request.wrapper,
      request.amount,
      request.recipientData,
    );
  }

  #buildDelegateDecryption(
    request: DelegateDecryptionRequest,
  ): ReturnType<typeof delegateForUserDecryptionContract> {
    const expDate = request.expirationDate
      ? BigInt(Math.floor(request.expirationDate.getTime() / 1000))
      : MAX_UINT64;
    return delegateForUserDecryptionContract(
      getAddress(request.aclAddress),
      getAddress(request.delegateAddress),
      getAddress(request.contractAddress),
      expDate,
    );
  }

  #buildRevokeDelegation(
    request: RevokeDelegationRequest,
  ): ReturnType<typeof revokeDelegationContract> {
    return revokeDelegationContract(
      getAddress(request.aclAddress),
      getAddress(request.delegateAddress),
      getAddress(request.contractAddress),
    );
  }

  async #assertSameChainAsPrepared(
    prepared: PreparedTransaction,
    operation: string,
  ): Promise<void> {
    const providerChainId = await this.#provider.getChainId();
    if (prepared.chainId !== providerChainId) {
      throw new PreparedChainMismatchError({
        operation: `${operation}(${prepared.kind})`,
        preparedChainId: prepared.chainId,
        providerChainId,
      });
    }
  }

  async #awaitReceipt(prepared: PreparedTransaction, txHash: Hex): Promise<TransactionResult> {
    try {
      const receipt = await this.#provider.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.#emitTransactionError(prepared, error);
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError(
        `Receipt wait failed for ${prepared.kind} (txHash ${txHash})`,
        { cause: error },
      );
    }
  }

  #emitSubmitted(prepared: PreparedTransaction, txHash: Hex): void {
    const operation = this.#submittedOperation(prepared);
    this.#emitEvent(transactionOperationMetadata[operation].submittedEvent(txHash), prepared.to);
  }

  #submittedOperation(prepared: PreparedTransaction): TransactionOperation {
    if (prepared.request.kind === "ApproveUnderlying" && prepared.request.amount === 0n) {
      return "approveUnderlying:reset";
    }
    return ERROR_OPERATION_BY_KIND[prepared.kind];
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
