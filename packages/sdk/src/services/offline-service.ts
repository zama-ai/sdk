import type { Address } from "viem";
import type { ChainRouter } from "../chains/router";
import {
  approveContract,
  confidentialBalanceOfContract,
  confidentialTransferContract,
  confidentialTransferFromContract,
  delegateForUserDecryptionContract,
  finalizeUnwrapContract,
  revokeDelegationContract,
  setOperatorContract,
  transferAndCallContract,
  unwrapContract,
  unwrapFromBalanceContract,
  wrapContract,
} from "../contracts";
import {
  ConfigurationError,
  DelegationDelegateEqualsContractError,
  DelegationExpirationTooSoonError,
  DelegationSelfNotAllowedError,
  EncryptionFailedError,
  wrapDecryptError,
} from "../errors";
import type { ZamaSDKEventInput } from "../events/sdk-events";
import {
  approveUnderlyingRequest,
  confidentialTransferFromRequest,
  confidentialTransferRequest,
  delegateDecryptionRequest,
  finalizeUnwrapRequest,
  prepareOptions,
  prepareTransactionParams,
  revokeDelegationRequest,
  setOperatorRequest,
  transferAndCallRequest,
  unwrapAllRequest,
  unwrapRequest,
  wrapRequest,
} from "../schemas/offline";
import type {
  ApproveUnderlyingRequest,
  ConfidentialTransferFromRequest,
  ConfidentialTransferRequest,
  DelegateDecryptionRequest,
  FinalizeUnwrapRequest,
  GenericProvider,
  PreparedFor,
  PrepareOptions,
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
import { parseSchema } from "../validation";
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
    options?: PrepareOptions,
  ): Promise<PreparedFor<K>> {
    if (options) {
      options = parseSchema(prepareOptions, options);
    }

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

    const calldata = await this.#buildCalldata(request);
    const params = {
      calldata,
      from: request.from,
      nonce: options?.nonce,
      gasLimit: options?.gasLimit,
      fees: options?.fees,
    };
    const parsed = parseSchema(prepareTransactionParams, params);
    const unsignedTx = await this.#provider.prepareTransaction(parsed);
    return { kind: request.kind, unsignedTx, from: parsed.from } satisfies PreparedFor<K>;
  }

  // ── internals ──────────────────────────────────────────────────────────

  async #buildCalldata(
    request: PrepareTransactionRequest,
  ): Promise<{
    readonly address: Address;
    readonly abi: readonly unknown[];
    readonly functionName: string;
    readonly args: readonly unknown[];
  }> {
    switch (request.kind) {
      case "ConfidentialTransfer":
        return this.#buildConfidentialTransfer(request);
      case "ConfidentialTransferFrom":
        return this.#buildConfidentialTransferFrom(request);
      case "SetOperator":
        return this.#buildSetOperator(request);
      case "Unwrap":
        return this.#buildUnwrap(request);
      case "UnwrapAll":
        return this.#buildUnwrapAll(request);
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
  ): Promise<ReturnType<typeof confidentialTransferContract>> {
    request = parseSchema(confidentialTransferRequest, request);
    const { encryptedValues, inputProof } = await this.#encryption.encryptValues({
      values: [{ value: request.amount, type: "euint64" }],
      contractAddress: request.token,
      userAddress: request.from,
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
    request = parseSchema(confidentialTransferFromRequest, request);
    // The encrypted input's proof binds to the tx sender (fhevm verifies it
    // against `msg.sender`), which for `transferFrom` is the operator == the
    // `from` wallet that signs and broadcasts — not the `owner` being debited.
    const { encryptedValues, inputProof } = await this.#encryption.encryptValues({
      values: [{ value: request.amount, type: "euint64" }],
      contractAddress: request.token,
      userAddress: request.from,
    });
    const handle = encryptedValues[0];
    if (!handle) {
      throw new EncryptionFailedError(
        "Encryption returned no handles for ConfidentialTransferFrom",
      );
    }
    return confidentialTransferFromContract(
      request.token,
      request.owner,
      request.to,
      handle,
      inputProof,
    );
  }

  #buildSetOperator(request: SetOperatorRequest): ReturnType<typeof setOperatorContract> {
    request = parseSchema(setOperatorRequest, request);
    return setOperatorContract(request.token, request.operator, request.until);
  }

  async #buildUnwrap(request: UnwrapRequest): Promise<ReturnType<typeof unwrapContract>> {
    request = parseSchema(unwrapRequest, request);
    const { encryptedValues, inputProof } = await this.#encryption.encryptValues({
      values: [{ value: request.amount, type: "euint64" }],
      contractAddress: request.token,
      userAddress: request.from,
    });
    const handle = encryptedValues[0];
    if (!handle) {
      throw new EncryptionFailedError("Encryption returned no handles for Unwrap");
    }
    return unwrapContract(request.token, request.from, request.to, handle, inputProof);
  }

  async #buildUnwrapAll(
    request: UnwrapAllRequest,
  ): Promise<ReturnType<typeof unwrapFromBalanceContract>> {
    request = parseSchema(unwrapAllRequest, request);
    const balanceHandle = await this.#provider.readContract(
      confidentialBalanceOfContract(request.token, request.from),
    );
    return unwrapFromBalanceContract(request.token, request.from, request.to, balanceHandle);
  }

  async #buildFinalizeUnwrap(
    request: FinalizeUnwrapRequest,
  ): Promise<ReturnType<typeof finalizeUnwrapContract>> {
    request = parseSchema(finalizeUnwrapRequest, request);
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
    request = parseSchema(approveUnderlyingRequest, request);
    return approveContract(request.underlying, request.spender, request.amount);
  }

  #buildWrap(request: WrapRequest): ReturnType<typeof wrapContract> {
    request = parseSchema(wrapRequest, request);
    return wrapContract(request.wrapper, request.to, request.amount);
  }

  #buildTransferAndCall(
    request: TransferAndCallRequest,
  ): ReturnType<typeof transferAndCallContract> {
    request = parseSchema(transferAndCallRequest, request);
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
    // Expiry ≥1h out: an expiry under 1h lands already-expired (or nearly so),
    // and the offline payload is signed/broadcast later, eating into that
    // margin further. Checked against the pre-parse `Date` (the schema
    // transforms it into the on-chain uint64 below).
    if (request.expirationDate && request.expirationDate.getTime() < Date.now() + 3_600_000) {
      throw new DelegationExpirationTooSoonError(
        "Expiration date must be at least 1 hour in the future",
      );
    }
    // `parseSchema` checksums the addresses and turns `expirationDate` (an
    // optional `Date`) into the on-chain uint64 expiry — seconds since epoch,
    // or MAX_UINT64 when omitted — so `parsed.expirationDate` is already the
    // bigint the contract call wants.
    const parsed = parseSchema(delegateDecryptionRequest, request);
    if (parsed.delegateAddress === parsed.from) {
      throw new DelegationSelfNotAllowedError(
        "Cannot delegate to yourself (delegate === msg.sender).",
      );
    }
    if (parsed.delegateAddress === parsed.contractAddress) {
      throw new DelegationDelegateEqualsContractError(
        `Delegate address cannot be the same as the contract address (${parsed.contractAddress}).`,
      );
    }
    return delegateForUserDecryptionContract(
      parsed.aclAddress,
      parsed.delegateAddress,
      parsed.contractAddress,
      parsed.expirationDate,
    );
  }

  #buildRevokeDelegation(
    request: RevokeDelegationRequest,
  ): ReturnType<typeof revokeDelegationContract> {
    request = parseSchema(revokeDelegationRequest, request);
    return revokeDelegationContract(
      request.aclAddress,
      request.delegateAddress,
      request.contractAddress,
    );
  }
}
