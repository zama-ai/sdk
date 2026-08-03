import { getAddress, isHex, size, type Address } from "viem";
import type { ChainRouter } from "../chains/router";
import {
  approveContract,
  confidentialBalanceOfContract,
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
import { ConfigurationError, EncryptionFailedError, wrapDecryptError } from "../errors";
import type { ZamaSDKEventInput } from "../events/sdk-events";
import type {
  ApproveUnderlyingRequest,
  ConfidentialTransferFromRequest,
  ConfidentialTransferRequest,
  DelegateDecryptionRequest,
  FinalizeUnwrapRequest,
  GenericProvider,
  PreparedFor,
  PrepareTransactionRequest,
  RevokeDelegationRequest,
  SetOperatorRequest,
  TransactionKind,
  TransferAndCallRequest,
  UnwrapAllRequest,
  UnwrapRequest,
  WrapRequest,
} from "../types";
import { assertBigint } from "../utils/assertions";
import type { EncryptionService } from "./encryption-service";

/**
 * Configuration for {@link OfflineService}.
 *
 * @internal
 */
export interface OfflineServiceConfig {
  readonly provider: GenericProvider;
  readonly router: ChainRouter;
  readonly encryption: EncryptionService;
  readonly emitEvent: (input: ZamaSDKEventInput, tokenAddress?: Address) => void;
}

/**
 * Optional behaviour overrides shared by every {@link OfflineService} method.
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
export interface OfflineOptions {
  /**
   * Override the nonce. Otherwise the provider reads the account's
   * `"pending"` transaction count.
   *
   * The `"pending"` tag only diverges from `"latest"` once an earlier tx has
   * been broadcast — it does **not** disambiguate several offline payloads
   * prepared before any of them is broadcast (they all read the same count).
   * When queuing multiple in-flight preparations against one wallet, assign
   * the nonces yourself here.
   */
  readonly nonce?: number;
  /**
   * Override `maxFeePerGas`. Otherwise the provider estimates it.
   *
   * `maxFeePerGas` and `maxPriorityFeePerGas` must be supplied together or
   * not at all — the provider rejects a partial pair rather than mixing a
   * pinned cap with an estimated tip (which can exceed the cap and fail
   * serialization).
   */
  readonly maxFeePerGas?: bigint;
  /** Override `maxPriorityFeePerGas`. Must accompany {@link OfflineOptions.maxFeePerGas}. */
  readonly maxPriorityFeePerGas?: bigint;
  /** Override the gas limit. Otherwise the provider calls `estimateGas`. */
  readonly gasLimit?: bigint;
}

/**
 * Offline-signing pipeline. Builds an RLP-encoded unsigned transaction that
 * the caller signs **and** publishes out-of-process — for institutional
 * custody, HSM ceremonies, and policy-engine workflows where signing cannot
 * happen synchronously in a single Promise.
 *
 * Atomic call sites ({@link Token.confidentialTransfer}, etc.) keep their
 * `signer.writeContract` path; this service is the parallel route where the
 * caller signs `prepared.unsignedTx` externally (HSM, custody API, policy
 * engine) and publishes the signed bytes through its own channel.
 *
 * Owned by {@link ZamaSDK}.
 *
 * @internal
 */
export class OfflineService {
  readonly #provider: GenericProvider;
  readonly #router: ChainRouter;
  readonly #encryption: EncryptionService;

  constructor(config: OfflineServiceConfig) {
    this.#provider = config.provider;
    this.#router = config.router;
    this.#encryption = config.encryption;
  }

  // ── prepare ─────────────────────────────────────────────────────────────

  /**
   * Build the offline-signing payload for the given transaction request:
   * an RLP-encoded unsigned transaction the caller signs externally (an HSM,
   * custody API, or any out-of-process signer) and publishes through its own
   * channel.
   *
   * Decryption permits are not transactions — acquire them via
   * `sdk.permits.grantPermit`, which signs with the configured signer
   * (including an out-of-process custody signer).
   */
  async prepare<K extends TransactionKind>(
    request: Extract<PrepareTransactionRequest, { kind: K }>,
    options?: OfflineOptions,
  ): Promise<PreparedFor<K>> {
    // The prepared tx's contract addresses and encrypted inputs are bound to
    // the SDK's configured chain; if the provider is on a different chain it
    // would bake that chain's id into a tx carrying wrong-chain addresses.
    // No signer here (offline is signer-less), so guard router vs provider
    // directly rather than through requireChainAlignment.
    const providerChainId = await this.#provider.getChainId();
    const expectedChainId = this.#router.chain.id;
    if (providerChainId !== expectedChainId) {
      throw new ConfigurationError(
        `Offline.prepare: provider is on chain ${providerChainId} but the SDK is configured for chain ${expectedChainId}. ` +
          `The prepared transaction's contract addresses and encrypted inputs are bound to chain ${expectedChainId} — point the provider at the same chain.`,
      );
    }

    const from = getAddress(request.from);
    const calldata = await this.#buildCalldata(request, from);
    const unsignedTx = await this.#provider.prepareTransaction({
      from,
      calldata,
      nonce: options?.nonce,
      maxFeePerGas: options?.maxFeePerGas,
      maxPriorityFeePerGas: options?.maxPriorityFeePerGas,
      gasLimit: options?.gasLimit,
    });
    return { kind: request.kind, from, unsignedTx } satisfies PreparedFor<K>;
  }

  // ── internals ──────────────────────────────────────────────────────────

  async #buildCalldata(
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
        const unhandled: { kind: string } = request;
        throw new ConfigurationError(
          `OfflineService.prepare: unsupported transaction kind '${unhandled.kind}'.`,
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
    from: Address,
  ): Promise<ReturnType<typeof confidentialTransferFromContract>> {
    // The encrypted input's proof binds to the tx sender (fhevm verifies it
    // against `msg.sender`), which for `transferFrom` is the operator == the
    // `from` wallet that signs and broadcasts — not the `owner` being debited.
    const { encryptedValues, inputProof } = await this.#encryption.encryptValues({
      values: [{ value: request.amount, type: "euint64" }],
      contractAddress: request.token,
      userAddress: from,
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
    // `until` is a required field on the offline request: the atomic path's
    // relative default (now + 1h) would silently expire mid-ceremony once the
    // payload is frozen, and defaulting to a far-future sentinel would grant a
    // de-facto permanent operator — both are unacceptable for a frozen offline
    // payload, so the caller must state the expiry explicitly.
    return setOperatorContract(request.token, getAddress(request.operator), request.until);
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
    // The wrapper's receiver hook does `to = data.length < 20 ? from :
    // address(bytes20(data))`, so a value that isn't empty and isn't exactly
    // 20 bytes (e.g. a 32-byte ABI-encoded address) is truncated to its first
    // 20 bytes — minting the shielded funds to a garbage address. Reject
    // anything other than an omitted value, `0x` (self-shield), or a raw
    // 20-byte address rather than let the funds go astray.
    const { recipientData } = request;
    if (recipientData !== undefined && recipientData !== "0x") {
      if (!isHex(recipientData) || size(recipientData) !== 20) {
        throw new ConfigurationError(
          `TransferAndCall.recipientData must be a raw 20-byte address, "0x", or omitted (self-shield to the sender). ` +
            `Got ${isHex(recipientData) ? `${size(recipientData)} bytes` : "a non-hex value"}. ` +
            `The wrapper truncates any non-20-byte payload to its first 20 bytes, which would mint to a garbage address — ` +
            `pass the recipient as 20 raw bytes (not a 32-byte ABI-encoded value).`,
        );
      }
    }
    return transferAndCallContract(
      request.underlying,
      request.wrapper,
      request.amount,
      recipientData,
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
}
