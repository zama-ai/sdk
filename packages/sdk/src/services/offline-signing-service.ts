import { getAddress, isHex, type Address, type Hex } from "viem";
import {
  approveContract,
  confidentialTransferContract,
  confidentialTransferFromContract,
  delegateForUserDecryptionContract,
  finalizeUnwrapContract,
  MAX_UINT64,
  revokeDelegationContract,
  setOperatorContract,
  transferAndCallContract,
  unwrapContract,
  unwrapFromBalanceContract,
  wrapContract,
} from "../contracts";
import { confidentialBalanceOfContract } from "../contracts/encrypted";
import type { CredentialService } from "../credentials/credential-service";
import { checksum } from "../credentials/utils";
import {
  ChainMismatchError,
  ConfigurationError,
  EncryptionFailedError,
  SignerAddressMismatchError,
  SignerNotConfiguredError,
  SigningFailedError,
  TransactionRevertedError,
  wrapDecryptError,
  ZamaError,
} from "../errors";
import type { TransactionErrorOperation, ZamaSDKEventInput } from "../events/sdk-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import { assertSignTransaction } from "../signer/capabilities";
import type {
  ApproveUnderlyingRequest,
  ConfidentialTransferFromRequest,
  ConfidentialTransferRequest,
  CredentialPermitRequest,
  CredentialPermitResult,
  DelegateDecryptionRequest,
  ExecuteRequest,
  FinalizeUnwrapRequest,
  GenericProvider,
  GenericSigner,
  PermitKind,
  PreparedFor,
  PreparedPermitFor,
  PreparedTransaction,
  RevokeDelegationRequest,
  SetOperatorRequest,
  TransactionKind,
  TransactionPrepareRequest,
  TransactionResult,
  TransferAndCallRequest,
  UnwrapAllRequest,
  UnwrapRequest,
  WrapRequest,
} from "../types";
import { toError } from "../utils";
import { assertBigint } from "../utils/assertions";
import type { EncryptionService } from "./encryption-service";

/** Configuration for {@link OfflineSigningService}. */
export interface OfflineSigningServiceConfig {
  /**
   * Optional signer. `prepare`, `broadcast`, `completeFromTxHash`, and
   * `refreshPrepared` work without a signer (canonical shape for
   * cross-process custody). `sign` and `execute` require a signer with the
   * `signTransaction` capability.
   */
  readonly signer?: GenericSigner;
  readonly provider: GenericProvider;
  readonly relayer: RelayerDispatcher;
  readonly encryption: EncryptionService;
  readonly credentials: CredentialService;
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
 */
export interface OfflineSigningOptions {
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

const SUBMITTED_EVENT_BY_KIND: Record<TransactionKind, ZamaSDKEventInput["type"]> = {
  ConfidentialTransfer: ZamaSDKEvents.TransferSubmitted,
  ConfidentialTransferFrom: ZamaSDKEvents.TransferFromSubmitted,
  SetOperator: ZamaSDKEvents.SetOperatorSubmitted,
  Unwrap: ZamaSDKEvents.UnwrapSubmitted,
  UnwrapAll: ZamaSDKEvents.UnwrapSubmitted,
  FinalizeUnwrap: ZamaSDKEvents.FinalizeUnwrapSubmitted,
  ApproveUnderlying: ZamaSDKEvents.ApproveUnderlyingSubmitted,
  Wrap: ZamaSDKEvents.ShieldSubmitted,
  TransferAndCall: ZamaSDKEvents.ShieldSubmitted,
  DelegateDecryption: ZamaSDKEvents.DelegationSubmitted,
  RevokeDelegation: ZamaSDKEvents.RevokeDelegationSubmitted,
};

const ERROR_OPERATION_BY_KIND: Record<TransactionKind, TransactionErrorOperation> = {
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
 * Deferred-signing pipeline. Separates `prepare`, `sign`, and `broadcast`
 * for institutional custody and policy-engine workflows where the three
 * phases cannot run synchronously in a single Promise.
 *
 * Atomic call sites (`Token.confidentialTransfer`, etc.) keep their
 * `signer.writeContract` path; this service is the parallel route for
 * signers that expose `signTransaction` instead.
 *
 * Owned by {@link ZamaSDK}.
 *
 * @internal
 */
export class OfflineSigningService {
  readonly #signer: GenericSigner | undefined;
  readonly #provider: GenericProvider;
  readonly #relayer: RelayerDispatcher;
  readonly #encryption: EncryptionService;
  readonly #credentials: CredentialService;
  readonly #emitEvent: (input: ZamaSDKEventInput, tokenAddress?: Address) => void;

  constructor(config: OfflineSigningServiceConfig) {
    this.#signer = config.signer;
    this.#provider = config.provider;
    this.#relayer = config.relayer;
    this.#encryption = config.encryption;
    this.#credentials = config.credentials;
    this.#emitEvent = config.emitEvent;
  }

  // ── prepare ─────────────────────────────────────────────────────────────

  /**
   * Build the deferred-signing payload for the given request.
   *
   * For transaction kinds, returns an RLP-encoded unsigned transaction the
   * caller signs externally (via {@link sign}, an HSM, or any out-of-process
   * signer) and feeds back through {@link broadcast} or {@link execute}.
   *
   * For `CredentialPermit`, returns an EIP-712 typed-data envelope to be
   * signed externally and fed back through {@link registerPermit}.
   *
   * Signer-optional: when a signer IS configured, its connected wallet
   * address must equal `request.from` or {@link SignerAddressMismatchError}
   * is thrown.
   */
  prepare<K extends TransactionKind>(
    request: Extract<TransactionPrepareRequest, { kind: K }>,
    options?: OfflineSigningOptions,
  ): Promise<PreparedFor<K>>;
  prepare<K extends PermitKind>(
    request: CredentialPermitRequest,
    options?: OfflineSigningOptions,
  ): Promise<PreparedPermitFor<K>>;
  async prepare(
    request: TransactionPrepareRequest | CredentialPermitRequest,
    options?: OfflineSigningOptions,
  ): Promise<PreparedTransaction | PreparedPermitFor<PermitKind>> {
    if (isCredentialPermitRequest(request)) {
      return this.#prepareCredentialPermit(request);
    }
    return this.#prepareTransaction(request, options);
  }

  async #prepareTransaction<K extends TransactionKind>(
    request: Extract<TransactionPrepareRequest, { kind: K }>,
    options?: OfflineSigningOptions,
  ): Promise<PreparedFor<K>> {
    const from = getAddress(request.from);
    await this.#assertMatchesConfiguredSigner(from, `prepare(${request.kind})`);
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

  async #prepareCredentialPermit(
    request: CredentialPermitRequest,
  ): Promise<PreparedPermitFor<"CredentialPermit">> {
    const from = getAddress(request.from);
    await this.#assertMatchesConfiguredSigner(from, `prepare(${request.kind})`);
    const chainId = await this.#provider.getChainId();
    const { typedData, keypair, scope, chunk, startTimestamp } =
      await this.#credentials.prepareEIP712(request.contracts, {
        from,
        chainId,
        delegator: request.delegator,
      });
    return {
      kind: "CredentialPermit",
      request,
      from,
      chainId,
      typedData,
      context: {
        keypairPublicKey: keypair.publicKey,
        signerAddress: scope.signerAddress,
        delegatorAddress: scope.delegatorAddress,
        chainId: scope.chainId,
        chunk,
        startTimestamp,
      },
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
   * @throws {@link SigningFailedError} when the signer rejects the signing
   *   request (HTTP error, policy denial, timeout). Already-typed
   *   {@link ZamaError} causes are re-thrown unchanged.
   */
  async sign(prepared: PreparedTransaction): Promise<Hex> {
    const signer = this.#requireSigner(`sign(${prepared.kind})`);
    assertSignTransaction(signer, `sign(${prepared.kind})`);
    try {
      return await signer.signTransaction(prepared.unsignedTx);
    } catch (error) {
      this.#emitTransactionError(prepared, error);
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new SigningFailedError(`Sign failed for ${prepared.kind}`, {
        cause: error,
      });
    }
  }

  // ── broadcast ───────────────────────────────────────────────────────────

  /**
   * Submit a previously-signed transaction, await its receipt, emit the
   * matching `*Submitted` event, and return the {@link TransactionResult}.
   *
   * Re-checks chain alignment between `prepared.chainId` and the configured
   * provider before sending — the gap between prepare and broadcast is the
   * whole point of deferred signing, and the user may have switched chains
   * meanwhile.
   *
   * Errors are reported in two distinct shapes so subscribers can recover:
   * a pre-submit failure (chain mismatch, RPC reject) is wrapped as
   * `TransactionRevertedError("Broadcast failed for …")`; a post-submit
   * failure (receipt wait timeout or revert) preserves `txHash` in the
   * message so the caller can resume via {@link completeFromTxHash}.
   */
  async broadcast(prepared: PreparedTransaction, signedTx: Hex): Promise<TransactionResult> {
    await this.#assertSameChainAsPrepared(prepared, "broadcast");
    let txHash: Hex;
    try {
      txHash = await this.#provider.sendRawTransaction(signedTx);
    } catch (error) {
      this.#emitTransactionError(prepared, error);
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError(`Broadcast failed for ${prepared.kind}`, { cause: error });
    }
    this.#emitSubmitted(prepared, txHash);
    return this.#awaitReceipt(prepared, txHash);
  }

  // ── execute (overloaded) ───────────────────────────────────────────────

  /**
   * Bundled in-process flow from a request. Accepts either a
   * {@link TransactionPrepareRequest} (prepare + sign + broadcast) or a
   * {@link CredentialPermitRequest} (prepare + sign + register the typed-data
   * signature in the credential cache).
   *
   * Callers who already hold a {@link PreparedTransaction} should chain
   * `await broadcast(prepared, await sign(prepared))` — keeping the
   * prepare/sign/broadcast call shape visible at the call site (code review
   * can tell whether `prepared` is fresh or stale without inspecting types).
   */
  execute(
    input: TransactionPrepareRequest,
    options?: OfflineSigningOptions,
  ): Promise<TransactionResult>;
  execute(
    input: CredentialPermitRequest,
    options?: OfflineSigningOptions,
  ): Promise<CredentialPermitResult | void>;
  execute(
    input: ExecuteRequest,
    options?: OfflineSigningOptions,
  ): Promise<TransactionResult | CredentialPermitResult | void>;
  async execute(
    input: ExecuteRequest,
    options?: OfflineSigningOptions,
  ): Promise<TransactionResult | CredentialPermitResult | void> {
    // execute is the in-process bundled flow; it always requires a signer
    // with signTransaction (or, for permits, with signTypedData via the
    // credential service which itself requires the signer).
    const signer = this.#requireSigner(`execute(${input.kind})`);
    if (isCredentialPermitRequest(input)) {
      const prepared = await this.#prepareCredentialPermit(input);
      if (prepared.typedData === null) {
        // Already covered — keypair warm, no signature needed.
        return;
      }
      const signature = await signer.signTypedData(prepared.typedData);
      return this.registerPermit(prepared, signature);
    }
    const prepared = await this.#prepareTransaction(input, options);
    const signedTx = await this.sign(prepared);
    return this.broadcast(prepared, signedTx);
  }

  // ── completeFromTxHash ─────────────────────────────────────────────────

  /**
   * Cache-sync escape hatch for the SDK-less broadcast path. Use when an
   * external process submitted `prepared.unsignedTx` directly via
   * `eth_sendRawTransaction` and this process needs to refresh its caches
   * without holding the signed bytes.
   */
  async completeFromTxHash(prepared: PreparedTransaction, txHash: Hex): Promise<TransactionResult> {
    await this.#assertSameChainAsPrepared(prepared, "completeFromTxHash");
    this.#emitSubmitted(prepared, txHash);
    return this.#awaitReceipt(prepared, txHash);
  }

  // ── refreshPrepared ────────────────────────────────────────────────────

  /**
   * Re-stamp a {@link PreparedFor} with the current chain state — fresh
   * nonce, fee parameters, and gas limit. Useful when the gap between
   * `prepare` and `sign` was long enough for values to drift (custodian
   * ceremony, multi-party approval, etc.).
   *
   * Signer-optional: works without a configured signer. The original
   * `prepared` is left untouched (immutable); the returned value is a fresh
   * `PreparedFor<K>` built from the original `request`.
   */
  refreshPrepared<K extends TransactionKind>(
    prepared: PreparedFor<K>,
    options?: OfflineSigningOptions,
  ): Promise<PreparedFor<K>> {
    return this.#prepareTransaction(
      prepared.request as Extract<TransactionPrepareRequest, { kind: K }>,
      options,
    );
  }

  // ── registerPermit ─────────────────────────────────────────────────────

  /**
   * Register an externally-signed {@link PreparedPermitFor} into the
   * credential cache. Pair with `prepare({ kind: "CredentialPermit", ... })`
   * and an external `signTypedData` call over `prepared.typedData`.
   *
   * Signer-optional: works without a configured signer (canonical
   * cross-process custody shape).
   *
   * @throws {@link SigningFailedError} if `signature` is not a valid
   *   0x-prefixed hex string.
   */
  async registerPermit<K extends PermitKind>(
    prepared: PreparedPermitFor<K>,
    signature: Hex,
  ): Promise<CredentialPermitResult> {
    if (!isHex(signature)) {
      throw new SigningFailedError(
        `registerPermit: expected a 0x-prefixed hex signature, got ${typeof signature}`,
      );
    }
    if (prepared.typedData === null) {
      // Already covered — nothing to register.
      return {
        contracts: prepared.context.chunk,
        durationDays: 0,
        startTimestamp: prepared.context.startTimestamp,
      };
    }
    const permit = await this.#credentials.registerSignedPermit({
      signature,
      keypair: { publicKey: prepared.context.keypairPublicKey },
      scope: {
        signerAddress: checksum(prepared.context.signerAddress),
        chainId: prepared.context.chainId,
        delegatorAddress: checksum(prepared.context.delegatorAddress),
      },
      chunk: prepared.context.chunk.map(checksum),
      startTimestamp: prepared.context.startTimestamp,
    });
    return {
      contracts: permit.signedContractAddresses,
      durationDays: permit.durationDays,
      startTimestamp: permit.startTimestamp,
    };
  }

  // ── internals ──────────────────────────────────────────────────────────

  async #buildCall(
    request: TransactionPrepareRequest,
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
        return this.#buildConfidentialTransferFrom(request, from);
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
        const _exhaustive: never = request;
        throw new ConfigurationError(
          `OfflineSigningService.prepare: unsupported transaction kind '${
            (_exhaustive as { kind: string }).kind
          }'.`,
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

  async #buildConfidentialTransferFrom(
    request: ConfidentialTransferFromRequest,
    _from: Address,
  ): Promise<ReturnType<typeof confidentialTransferFromContract>> {
    const { handles, inputProof } = await this.#encryption.encrypt({
      values: [{ value: request.amount, type: "euint64" }],
      contractAddress: request.token,
      userAddress: getAddress(request.owner),
    });
    const handle = handles[0];
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
    return setOperatorContract(request.token, getAddress(request.operator), request.until);
  }

  async #buildUnwrap(
    request: UnwrapRequest,
    from: Address,
  ): Promise<ReturnType<typeof unwrapContract>> {
    const { handles, inputProof } = await this.#encryption.encrypt({
      values: [{ value: request.amount, type: "euint64" }],
      contractAddress: request.token,
      userAddress: from,
    });
    const handle = handles[0];
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
    const decrypted = await this.#relayer
      .publicDecrypt([request.unwrapRequestIdOrAmount])
      .catch((error: unknown) => {
        throw wrapDecryptError(error, "Public decryption failed during FinalizeUnwrap");
      });
    const raw = decrypted.clearValues[request.unwrapRequestIdOrAmount];
    assertBigint(raw, "FinalizeUnwrap: publicDecrypt(handle).clearValue");
    return finalizeUnwrapContract(
      request.wrapper,
      request.unwrapRequestIdOrAmount,
      raw,
      decrypted.decryptionProof,
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
      request.aclAddress,
      getAddress(request.delegateAddress),
      getAddress(request.contractAddress),
      expDate,
    );
  }

  #buildRevokeDelegation(
    request: RevokeDelegationRequest,
  ): ReturnType<typeof revokeDelegationContract> {
    return revokeDelegationContract(
      request.aclAddress,
      getAddress(request.delegateAddress),
      getAddress(request.contractAddress),
    );
  }

  /**
   * If a signer is configured, fail when its connected wallet address does
   * not match the requested `from`, or when its chain disagrees with the
   * provider's chain. Cross-process flows (no signer configured) skip this
   * check entirely — `request.from` is the source of truth and the caller
   * is responsible for routing the prepared tx to the right chain.
   */
  async #assertMatchesConfiguredSigner(from: Address, operation: string): Promise<void> {
    if (!this.#signer) {
      return;
    }
    const snapshot = this.#signer.walletAccount.getSnapshot();
    if (!snapshot) {
      return;
    }
    if (getAddress(snapshot.address) !== getAddress(from)) {
      throw new SignerAddressMismatchError({
        operation,
        requested: getAddress(from),
        configured: getAddress(snapshot.address),
      });
    }
    const providerChainId = await this.#provider.getChainId();
    if (snapshot.chainId !== providerChainId) {
      throw new ChainMismatchError({
        operation,
        signerChainId: snapshot.chainId,
        providerChainId,
      });
    }
  }

  #requireSigner(operation: string): GenericSigner {
    if (!this.#signer) {
      throw new SignerNotConfiguredError(operation);
    }
    return this.#signer;
  }

  async #assertSameChainAsPrepared(
    prepared: PreparedTransaction,
    operation: string,
  ): Promise<void> {
    const providerChainId = await this.#provider.getChainId();
    if (prepared.chainId !== providerChainId) {
      throw new ChainMismatchError({
        operation: `${operation}(${prepared.kind})`,
        signerChainId: prepared.chainId,
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
        `Receipt wait failed for ${prepared.kind} (txHash ${txHash}); resume with completeFromTxHash`,
        { cause: error },
      );
    }
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

function isCredentialPermitRequest(value: ExecuteRequest): value is CredentialPermitRequest {
  return value.kind === "CredentialPermit";
}
