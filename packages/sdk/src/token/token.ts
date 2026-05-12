import { type Address, getAddress, type Hex } from "viem";
import {
  allowanceContract,
  approveContract,
  balanceOfContract,
  confidentialTransferContract,
  confidentialTransferFromContract,
  finalizeUnwrapContract,
  isPayableTokenContract,
  isOperatorContract,
  setOperatorContract,
  transferAndCallContract,
  underlyingContract,
  unwrapContract,
  unwrapFromBalanceContract,
  wrapContract,
} from "../contracts";
import { findUnwrapRequested } from "../events/onchain-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { Handle } from "../relayer/relayer-sdk.types";
import { isContractCallError, toError } from "../utils";
import {
  ApprovalFailedError,
  BalanceCheckUnavailableError,
  DecryptionFailedError,
  ERC20ReadFailedError,
  EncryptionFailedError,
  InsufficientConfidentialBalanceError,
  InsufficientERC20BalanceError,
  TransactionRevertedError,
  ZamaError,
} from "../errors";
import { assertWriteContract } from "../signer/capabilities";
import { isZeroHandle } from "../utils/handles";
import { ReadonlyToken } from "./readonly-token";
import type {
  ApproveUnderlyingRequest,
  PreparedFor,
  ShieldCallbacks,
  ShieldOptions,
  TransactionResult,
  TransferAndCallRequest,
  TransferCallbacks,
  TransferOptions,
  UnshieldCallbacks,
  UnshieldOptions,
  WrapRequest,
} from "../types";

/**
 * Multi-step shield plan returned by {@link Token.prepareShield}. Each step
 * is a {@link TransactionPrepareRequest} the caller passes to
 * {@link ZamaSDK.prepare} in order. Preparing immediately before signing
 * keeps nonces fresh.
 *
 * Why a plan, not a single prepared tx: non-ERC-1363 underlyings need an
 * `approve` (sometimes preceded by a USDT-style zero-reset) followed by a
 * `wrap`, and the routing decision depends on an on-chain `isPayable()`
 * probe + a live `allowance()` read. The discriminated tuple shape below
 * makes (path, steps.length) inseparable at the type level so
 * `transferAndCall`-with-two-steps and similar illegal combinations are
 * unrepresentable.
 *
 * The `approveAndWrap` arm has three sub-shapes mirroring the atomic
 * `#ensureAllowance` decision tree:
 *
 * - `[Wrap]` — the user already has sufficient allowance; skip approve.
 * - `[Approve, Wrap]` — current allowance is zero; approve target, then wrap.
 * - `[Approve(0), Approve, Wrap]` — non-zero allowance below target. Reset
 *   first because USDT-style tokens revert on a non-zero → non-zero approve
 *   and the zero-reset also mitigates the ERC-20 approve race for any token.
 */
export type ShieldPlan =
  | {
      readonly path: "transferAndCall";
      readonly steps: readonly [TransferAndCallRequest];
    }
  | {
      readonly path: "approveAndWrap";
      readonly steps:
        | readonly [WrapRequest]
        | readonly [ApproveUnderlyingRequest, WrapRequest]
        | readonly [ApproveUnderlyingRequest, ApproveUnderlyingRequest, WrapRequest];
    };
import type { ZamaSDK } from "../zama-sdk";
import { assertBigint } from "../utils/assertions";

/**
 * ERC-20-like interface for a single confidential token.
 * Hides all FHE complexity (encryption, decryption, EIP-712 signing)
 * behind familiar methods.
 *
 * Extends {@link ReadonlyToken} with write operations
 * (transfer, shield, unshield).
 */
export class Token extends ReadonlyToken {
  static readonly ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

  readonly wrapper: Address;
  #underlying: Address | undefined;
  #underlyingPromise: Promise<Address> | null = null;
  #isPayable: boolean | null = null;

  constructor(sdk: ZamaSDK, address: Address, wrapper?: Address) {
    super(sdk, address);
    this.wrapper = wrapper ? getAddress(wrapper) : this.address;
  }

  async #getUnderlying(): Promise<Address> {
    if (this.#underlying !== undefined) {
      return this.#underlying;
    }
    if (!this.#underlyingPromise) {
      this.#underlyingPromise = this.sdk.provider
        .readContract(underlyingContract(this.wrapper))
        .then((v) => {
          this.#underlying = v;
          this.#underlyingPromise = null;
          return v;
        })
        .catch((error) => {
          this.#underlyingPromise = null;
          throw error;
        });
    }
    return this.#underlyingPromise;
  }

  /**
   * Check whether the underlying ERC-20 supports ERC-1363 (payable token).
   *
   * Only successful probes are cached. An `underlying()` or
   * `supportsInterface(...)` revert is conclusive ("the token doesn't
   * advertise ERC-1363") and gets cached as `false`; an RPC transport error
   * is *not* conclusive — caching it would permanently downgrade a
   * 1363-capable token to the slower approve+wrap path. Transport errors
   * therefore bubble up so the caller can retry, and the next call
   * re-probes.
   */
  async isPayable(): Promise<boolean> {
    if (this.#isPayable !== null) {
      return this.#isPayable;
    }
    try {
      const underlying = await this.#getUnderlying();
      this.#isPayable = await this.sdk.provider.readContract(isPayableTokenContract(underlying));
      return this.#isPayable;
    } catch (error) {
      if (isContractCallError(error)) {
        this.#isPayable = false;
        return false;
      }
      throw error;
    }
  }

  // WRITE OPERATIONS

  /**
   * Confidential transfer. Encrypts the amount via FHE, then calls the contract.
   * Returns the transaction hash.
   *
   * By default, the SDK validates the confidential balance before submitting.
   * If a cached plaintext balance exists it is used; otherwise, if credentials
   * are cached, it decrypts on the fly. Set `skipBalanceCheck: true` to bypass
   * this validation (e.g. for smart wallets).
   *
   * @param to - Recipient address.
   * @param amount - Plaintext amount to transfer (encrypted automatically via FHE).
   * @param options - Optional: `skipBalanceCheck` (default `false`).
   * @returns The transaction hash and mined receipt.
   * @throws {@link ChainMismatchError} if signer and provider are on different chains.
   * @throws {@link InsufficientConfidentialBalanceError} if the confidential balance is less than `amount`.
   * @throws {@link BalanceCheckUnavailableError} if balance validation is required but decryption is not possible (no cached credentials).
   * @throws {@link EncryptionFailedError} if FHE encryption fails.
   * @throws {@link TransactionRevertedError} if the on-chain transfer reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.confidentialTransfer("0xRecipient", 1000n);
   * // Smart wallet (skip balance check):
   * const txHash = await token.confidentialTransfer("0xRecipient", 1000n, { skipBalanceCheck: true });
   * ```
   */
  async confidentialTransfer(
    to: Address,
    amount: bigint,
    options?: TransferOptions,
  ): Promise<TransactionResult> {
    const signer = this.sdk.requireSigner("confidentialTransfer");
    assertWriteContract(signer, "confidentialTransfer");
    const account = await this.sdk.requireAlignedWalletAccount("confidentialTransfer");
    const { skipBalanceCheck = false, onEncryptComplete, onTransferSubmitted } = options ?? {};

    const normalizedTo = getAddress(to);

    if (!skipBalanceCheck) {
      await this.#assertConfidentialBalance(amount);
    }

    const { handles, inputProof } = await this.sdk.encrypt({
      values: [{ value: amount, type: "euint64" }],
      contractAddress: this.address,
      userAddress: getAddress(account.address),
    });
    safeCallback(() => onEncryptComplete?.());

    if (handles.length === 0) {
      throw new EncryptionFailedError("Encryption returned no handles");
    }

    try {
      const txHash = await signer.writeContract(
        confidentialTransferContract(this.address, normalizedTo, handles[0]!, inputProof),
      );
      this.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash });
      safeCallback(() => onTransferSubmitted?.(txHash));
      const receipt = await this.sdk.provider.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "transfer",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("Transfer transaction failed", {
        cause: error,
      });
    }
  }

  /**
   * Operator encrypted transfer on behalf of another address.
   * The caller must be an approved operator for `from`.
   *
   * @param from - The address to transfer from (caller must be an approved operator).
   * @param to - Recipient address.
   * @param amount - Plaintext amount to transfer (encrypted automatically via FHE).
   * @returns The transaction hash and mined receipt.
   * @throws {@link ChainMismatchError} if signer and provider are on different chains.
   * @throws {@link EncryptionFailedError} if FHE encryption fails.
   * @throws {@link TransactionRevertedError} if the on-chain transfer reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.confidentialTransferFrom("0xFrom", "0xTo", 500n);
   * ```
   */
  async confidentialTransferFrom(
    from: Address,
    to: Address,
    amount: bigint,
    callbacks?: TransferCallbacks,
  ): Promise<TransactionResult> {
    const signer = this.sdk.requireSigner("confidentialTransferFrom");
    assertWriteContract(signer, "confidentialTransferFrom");
    await this.sdk.requireChainAlignment("confidentialTransferFrom");
    const normalizedFrom = getAddress(from);
    const normalizedTo = getAddress(to);

    const { handles, inputProof } = await this.sdk.encrypt({
      values: [{ value: amount, type: "euint64" }],
      contractAddress: this.address,
      userAddress: normalizedFrom,
    });
    safeCallback(() => callbacks?.onEncryptComplete?.());

    if (handles.length === 0) {
      throw new EncryptionFailedError("Encryption returned no handles");
    }

    try {
      const txHash = await signer.writeContract(
        confidentialTransferFromContract(
          this.address,
          normalizedFrom,
          normalizedTo,
          handles[0]!,
          inputProof,
        ),
      );
      this.emit({ type: ZamaSDKEvents.TransferFromSubmitted, txHash });
      safeCallback(() => callbacks?.onTransferSubmitted?.(txHash));
      const receipt = await this.sdk.provider.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "transferFrom",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("TransferFrom transaction failed", {
        cause: error,
      });
    }
  }

  /**
   * Set operator approval for the confidential token.
   * Defaults to 1 hour from now if `until` is not specified.
   *
   * @param operator - The address to set as an operator.
   * @param until - Optional Unix timestamp for approval expiry. Defaults to now + 1 hour.
   * @returns The transaction hash and mined receipt.
   * @throws {@link ChainMismatchError} if signer and provider are on different chains.
   * @throws {@link ApprovalFailedError} if the approval transaction fails.
   *
   * @example
   * ```ts
   * const txHash = await token.setOperator("0xOperator");
   * ```
   */
  async setOperator(operator: Address, until?: number): Promise<TransactionResult> {
    const signer = this.sdk.requireSigner("setOperator");
    assertWriteContract(signer, "setOperator");
    await this.sdk.requireChainAlignment("setOperator");
    const normalizedOperator = getAddress(operator);
    try {
      const txHash = await signer.writeContract(
        setOperatorContract(this.address, normalizedOperator, until),
      );
      this.emit({ type: ZamaSDKEvents.SetOperatorSubmitted, txHash });
      const receipt = await this.sdk.provider.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "setOperator",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new ApprovalFailedError("Operator approval failed", {
        cause: error,
      });
    }
  }

  /**
   * Check if a spender is an approved operator for a given holder.
   *
   * @param holder - The token holder address.
   * @param spender - The address to check operator approval for.
   * @returns `true` if the spender is an approved operator for the holder.
   *
   * @example
   * ```ts
   * if (await token.isOperator("0xHolder", "0xSpender")) {
   *   // spender can call transferFrom on behalf of holder
   * }
   * ```
   */
  async isOperator(holder: Address, spender: Address): Promise<boolean> {
    return this.sdk.provider.readContract(
      isOperatorContract(this.address, getAddress(holder), getAddress(spender)),
    );
  }

  /**
   * Shield public ERC-20 tokens into confidential tokens.
   *
   * Routing is decided automatically by ERC-165 introspection on the
   * underlying ERC-20: ERC-1363 `transferAndCall` (single tx, no approval)
   * when supported, otherwise `approve` + `wrap` (two txs).
   *
   * On the `approveAndWrap` path, ERC-20 approval is handled automatically
   * via `approvalStrategy` (`"exact"` by default, `"max"` for unlimited
   * approval, `"skip"` to opt out). `approvalStrategy` is **ignored** on
   * the `transferAndCall` path (the single tx authorizes itself).
   *
   * The ERC-20 balance is validated before submitting (public read, no
   * signing required).
   *
   * @param amount - The plaintext amount to shield.
   * @param options - Optional: `approvalStrategy`, `to`, callbacks.
   * @returns The transaction hash and mined receipt.
   * @throws {@link ChainMismatchError} if signer and provider are on different chains.
   * @throws {@link InsufficientERC20BalanceError} if the ERC-20 balance is less than `amount`.
   * @throws {@link ApprovalFailedError} if the ERC-20 approval step fails.
   * @throws {@link TransactionRevertedError} if the shield transaction reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.shield(1000n);
   * ```
   */
  async shield(amount: bigint, options?: ShieldOptions): Promise<TransactionResult> {
    const account = await this.sdk.requireAlignedWalletAccount("shield");

    const isPayableToken = await this.isPayable();
    const underlying = await this.#getUnderlying();
    const userAddress = getAddress(account.address);

    // ERC-20 balance check (public read, no signing needed)
    let erc20Balance: bigint;
    try {
      erc20Balance = await this.sdk.provider.readContract(
        balanceOfContract(underlying, userAddress),
      );
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new ERC20ReadFailedError(
        `Could not read ERC-20 balance for shield validation (token: ${underlying})`,
        { cause: toError(error) },
      );
    }
    if (erc20Balance < amount) {
      throw new InsufficientERC20BalanceError(
        `Insufficient ERC-20 balance: requested ${amount}, available ${erc20Balance} (token: ${underlying})`,
        { requested: amount, available: erc20Balance, token: underlying },
      );
    }

    if (isPayableToken) {
      return this.#shieldViaTransferAndCall(amount, underlying, userAddress, options);
    }

    return this.#shieldViaApproveAndWrap(amount, userAddress, options);
  }

  async #shieldViaTransferAndCall(
    amount: bigint,
    underlying: Address,
    userAddress: Address,
    options?: ShieldOptions,
  ): Promise<TransactionResult> {
    const signer = this.sdk.requireSigner("shield");
    assertWriteContract(signer, "shield");
    const recipient = options?.to ? getAddress(options.to) : userAddress;
    // ERC7984ERC20Wrapper.onTransferReceived decodes the recipient via
    // `address(bytes20(data))` — i.e. the first 20 bytes of `data`. We pass
    // the raw 20-byte address (not ABI-encoded), and the empty payload `0x`
    // for self-shield so the wrapper falls back to `from`.
    const data: Hex = recipient === userAddress ? "0x" : recipient;

    try {
      const txHash = await signer.writeContract(
        transferAndCallContract(underlying, this.wrapper, amount, data),
      );
      this.emit({
        type: ZamaSDKEvents.ShieldSubmitted,
        txHash,
        shieldPath: "transferAndCall",
      });
      safeCallback(() => options?.onShieldSubmitted?.(txHash));
      const receipt = await this.sdk.provider.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "shield:transferAndCall",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("TransferAndCall shield transaction failed", {
        cause: error,
      });
    }
  }

  async #shieldViaApproveAndWrap(
    amount: bigint,
    userAddress: Address,
    options?: ShieldOptions,
  ): Promise<TransactionResult> {
    const signer = this.sdk.requireSigner("shield");
    assertWriteContract(signer, "shield");
    const strategy = options?.approvalStrategy ?? "exact";
    if (strategy !== "skip") {
      await this.#ensureAllowance(amount, strategy === "max", options);
    }

    try {
      const recipient = options?.to ? getAddress(options.to) : userAddress;
      const txHash = await signer.writeContract(wrapContract(this.wrapper, recipient, amount));
      this.emit({
        type: ZamaSDKEvents.ShieldSubmitted,
        txHash,
        shieldPath: "approveAndWrap",
      });
      safeCallback(() => options?.onShieldSubmitted?.(txHash));
      const receipt = await this.sdk.provider.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "shield:approveAndWrap",
        error: toError(error),
      });

      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("ApproveAndWrap shield transaction failed", {
        cause: error,
      });
    }
  }

  /**
   * Request an unwrap for a specific amount. Encrypts the amount first.
   * Call {@link finalizeUnwrap} after the request is processed on-chain.
   *
   * @param amount - The plaintext amount to unwrap (encrypted automatically).
   * @returns The transaction hash and mined receipt.
   * @throws {@link ChainMismatchError} if signer and provider are on different chains.
   * @throws {@link EncryptionFailedError} if FHE encryption fails.
   * @throws {@link TransactionRevertedError} if the unwrap transaction reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.unwrap(500n);
   * ```
   */
  async unwrap(amount: bigint): Promise<TransactionResult> {
    const signer = this.sdk.requireSigner("unwrap");
    assertWriteContract(signer, "unwrap");
    const account = await this.sdk.requireAlignedWalletAccount("unwrap");
    const userAddress = getAddress(account.address);

    const { handles, inputProof } = await this.sdk.encrypt({
      values: [{ value: amount, type: "euint64" }],
      contractAddress: this.wrapper,
      userAddress,
    });

    if (handles.length === 0) {
      throw new EncryptionFailedError("Encryption returned no handles");
    }

    try {
      const txHash = await signer.writeContract(
        unwrapContract(this.address, userAddress, userAddress, handles[0]!, inputProof),
      );
      this.emit({ type: ZamaSDKEvents.UnwrapSubmitted, txHash });
      const receipt = await this.sdk.provider.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "unwrap",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("Unshield transaction failed", {
        cause: error,
      });
    }
  }

  /**
   * Request an unwrap for the entire confidential balance.
   * Uses the on-chain balance handle directly (no encryption needed).
   * Throws if the balance is zero.
   *
   * @returns The transaction hash and mined receipt.
   * @throws {@link ChainMismatchError} if signer and provider are on different chains.
   * @throws {@link DecryptionFailedError} if the balance is zero.
   * @throws {@link TransactionRevertedError} if the unwrap transaction reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.unwrapAll();
   * ```
   */
  async unwrapAll(): Promise<TransactionResult> {
    const signer = this.sdk.requireSigner("unwrapAll");
    assertWriteContract(signer, "unwrapAll");
    const account = await this.sdk.requireAlignedWalletAccount("unwrapAll");
    const userAddress = getAddress(account.address);
    const handle = await this.readConfidentialBalanceOf(userAddress);

    if (isZeroHandle(handle)) {
      throw new DecryptionFailedError("Cannot unshield: balance is zero");
    }

    try {
      const txHash = await signer.writeContract(
        unwrapFromBalanceContract(this.address, userAddress, userAddress, handle),
      );
      this.emit({ type: ZamaSDKEvents.UnwrapSubmitted, txHash });
      const receipt = await this.sdk.provider.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "unwrap",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("Unshield-all transaction failed", {
        cause: error,
      });
    }
  }

  /**
   * Unshield a specific amount and finalize in one call.
   * Orchestrates: unshield → wait for receipt → parse event → finalize.
   *
   * By default, the SDK validates the confidential balance before submitting.
   * Set `skipBalanceCheck: true` to bypass this validation (e.g. for smart wallets).
   *
   * @param amount - The plaintext amount to unshield.
   * @param options - Optional: `skipBalanceCheck` (default `false`), `callbacks`.
   * @returns The finalize transaction hash and mined receipt.
   * @throws {@link InsufficientConfidentialBalanceError} if the confidential balance is less than `amount`.
   * @throws {@link BalanceCheckUnavailableError} if balance validation is required but decryption is not possible.
   * @throws {@link EncryptionFailedError} if FHE encryption fails.
   * @throws {@link TransactionRevertedError} if any transaction in the flow reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.unshield(500n);
   * // Smart wallet (skip balance check):
   * const txHash = await token.unshield(500n, { skipBalanceCheck: true });
   * ```
   */
  async unshield(amount: bigint, options?: UnshieldOptions): Promise<TransactionResult> {
    const {
      skipBalanceCheck = false,
      onUnwrapSubmitted,
      onFinalizing,
      onFinalizeSubmitted,
    } = options ?? {};

    if (!skipBalanceCheck) {
      await this.#assertConfidentialBalance(amount);
    }

    const callbacks: UnshieldCallbacks = {
      onFinalizing,
      onFinalizeSubmitted,
    };
    const operationId = crypto.randomUUID();
    const unwrapResult = await this.unwrap(amount);
    safeCallback(() => onUnwrapSubmitted?.(unwrapResult.txHash));
    return this.#waitAndFinalizeUnshield(unwrapResult.txHash, operationId, callbacks);
  }

  /**
   * Unshield the entire balance and finalize in one call.
   * Orchestrates: unshieldAll → wait for receipt → parse event → finalize.
   *
   * @param callbacks - Optional progress callbacks for each phase.
   * @returns The finalize transaction hash and mined receipt.
   * @throws {@link DecryptionFailedError} if the balance is zero.
   * @throws {@link TransactionRevertedError} if any transaction in the flow reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.unshieldAll();
   * ```
   */
  async unshieldAll(callbacks?: UnshieldCallbacks): Promise<TransactionResult> {
    const operationId = crypto.randomUUID();
    const unwrapResult = await this.unwrapAll();
    safeCallback(() => callbacks?.onUnwrapSubmitted?.(unwrapResult.txHash));
    return this.#waitAndFinalizeUnshield(unwrapResult.txHash, operationId, callbacks);
  }

  /**
   * Resume an in-progress unshield from an existing unwrap tx hash.
   * Useful when the user already submitted the unwrap but the finalize step
   * was interrupted (e.g. page reload, network error).
   *
   * @param unwrapTxHash - The transaction hash of the previously submitted unwrap.
   * @param callbacks - Optional progress callbacks.
   * @returns The finalize transaction hash and mined receipt.
   * @throws {@link TransactionRevertedError} if finalization fails.
   *
   * @example
   * ```ts
   * const txHash = await token.resumeUnshield(previousUnwrapTxHash);
   * ```
   */
  async resumeUnshield(
    unwrapTxHash: Hex,
    callbacks?: UnshieldCallbacks,
  ): Promise<TransactionResult> {
    return this.#waitAndFinalizeUnshield(unwrapTxHash, crypto.randomUUID(), callbacks);
  }

  /**
   * Complete an unwrap by providing the public decryption proof.
   * Call this after an unshield request has been processed on-chain.
   *
   * @param unwrapRequestIdOrAmount - `unwrapRequestId` from upgraded wrappers, or the encrypted amount handle from legacy wrappers.
   * @returns The transaction hash and mined receipt.
   * @throws {@link ChainMismatchError} if signer and provider are on different chains.
   * @throws {@link DecryptionFailedError} if public decryption fails.
   * @throws {@link TransactionRevertedError} if the finalize transaction reverts.
   *
   * @example
   * ```ts
   * const event = findUnwrapRequested(receipt.logs);
   * const txHash = await token.finalizeUnwrap(event.unwrapRequestId ?? event.encryptedAmount);
   * ```
   */
  async finalizeUnwrap(unwrapRequestIdOrAmount: Handle): Promise<TransactionResult> {
    const signer = this.sdk.requireSigner("finalizeUnwrap");
    assertWriteContract(signer, "finalizeUnwrap");
    await this.sdk.requireChainAlignment("finalizeUnwrap");
    const result = await this.sdk.publicDecrypt([unwrapRequestIdOrAmount]);
    const clearValue = result.clearValues[unwrapRequestIdOrAmount];
    assertBigint(clearValue, "finalizeUnwrap: clearValue");
    try {
      const txHash = await signer.writeContract(
        finalizeUnwrapContract(
          this.wrapper,
          unwrapRequestIdOrAmount,
          clearValue,
          result.decryptionProof,
        ),
      );
      this.emit({ type: ZamaSDKEvents.FinalizeUnwrapSubmitted, txHash });
      const receipt = await this.sdk.provider.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "finalizeUnwrap",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("Failed to finalize unshield", {
        cause: error,
      });
    }
  }

  /**
   * Approve this token contract to spend the underlying ERC-20.
   * Defaults to max uint256. Resets to zero first if there's an existing
   * non-zero allowance (required by tokens like USDT).
   *
   * @param amount - Optional approval amount. Defaults to max uint256.
   * @returns The transaction hash and mined receipt.
   * @throws {@link ChainMismatchError} if signer and provider are on different chains.
   * @throws {@link ApprovalFailedError} if the approval transaction fails.
   *
   * @example
   * ```ts
   * await token.approveUnderlying(); // max approval
   * await token.approveUnderlying(1000n); // exact amount
   * ```
   */
  async approveUnderlying(amount?: bigint): Promise<TransactionResult> {
    const signer = this.sdk.requireSigner("approveUnderlying");
    assertWriteContract(signer, "approveUnderlying");
    const account = await this.sdk.requireAlignedWalletAccount("approveUnderlying");
    const underlying = await this.#getUnderlying();
    const userAddress = getAddress(account.address);

    const approvalAmount = amount ?? 2n ** 256n - 1n;

    try {
      if (approvalAmount > 0n) {
        const currentAllowance = await this.sdk.provider.readContract(
          allowanceContract(underlying, userAddress, this.wrapper),
        );

        if (currentAllowance > 0n) {
          await signer.writeContract(approveContract(underlying, this.wrapper, 0n));
        }
      }

      const txHash = await signer.writeContract(
        approveContract(underlying, this.wrapper, approvalAmount),
      );
      this.emit({ type: ZamaSDKEvents.ApproveUnderlyingSubmitted, txHash });
      const receipt = await this.sdk.provider.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "approveUnderlying",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new ApprovalFailedError("ERC-20 approval failed", {
        cause: error,
      });
    }
  }

  // DELEGATION OPERATIONS

  /**
   * Delegate decryption rights for this token to another address.
   * Calls `ACL.delegateForUserDecryption()` on-chain.
   *
   * **Important:** After the transaction is mined, allow **1–2 minutes** before
   * calling {@link ReadonlyToken.decryptBalanceAs | decryptBalanceAs}. The delegation
   * is recorded on L1 immediately, but the gateway (on Arbitrum) must sync the
   * ACL state via cross-chain event propagation. Attempting delegated decryption
   * before propagation completes will throw a
   * {@link DelegationNotPropagatedError}.
   *
   * @param delegateAddress - Address to delegate decryption rights to.
   * @param expirationDate - Optional expiration date (defaults to permanent delegation via `uint64.max`).
   * @returns The transaction hash and mined receipt.
   * @throws {@link ChainMismatchError} if signer and provider are on different chains.
   * @throws {@link TransactionRevertedError} if the delegation transaction reverts.
   */
  async delegateDecryption({
    delegateAddress,
    expirationDate,
  }: {
    delegateAddress: Address;
    expirationDate?: Date;
  }): Promise<TransactionResult> {
    return this.sdk.delegateDecryption({
      contractAddress: this.address,
      delegateAddress,
      expirationDate,
    });
  }

  /**
   * Revoke decryption delegation for this token.
   * Calls `ACL.revokeDelegationForUserDecryption()` on-chain.
   *
   * @param delegateAddress - Address to revoke delegation from.
   * @returns The transaction hash and mined receipt.
   * @throws {@link ChainMismatchError} if signer and provider are on different chains.
   * @throws {@link TransactionRevertedError} if the revocation transaction reverts.
   */
  async revokeDelegation({
    delegateAddress,
  }: {
    delegateAddress: Address;
  }): Promise<TransactionResult> {
    return this.sdk.revokeDelegation({
      contractAddress: this.address,
      delegateAddress,
    });
  }

  // ── Deferred-signing surface ────────────────────────────────────────
  // For each atomic write method above, a paired prepare* / complete*
  // returns / consumes a PreparedTransaction so a custodian or HSM signer
  // can sign out-of-process and the SDK still owns calldata building,
  // public-key resolution, and cache-sync. Shielding uses prepareShield
  // (multi-step plan); unshielding is caller-orchestrated via prepareUnwrap
  // then prepareFinalizeUnwrap — see each method's JSDoc for the flow.

  prepareConfidentialTransfer(args: {
    to: Address;
    amount: bigint;
  }): Promise<PreparedFor<"ConfidentialTransfer">> {
    return this.sdk.prepare({
      kind: "ConfidentialTransfer",
      token: this.address,
      to: getAddress(args.to),
      amount: args.amount,
    });
  }

  completeConfidentialTransfer(
    prepared: PreparedFor<"ConfidentialTransfer">,
    txHash: Hex,
  ): Promise<TransactionResult> {
    return this.sdk.completeFromTxHash(prepared, txHash);
  }

  prepareConfidentialTransferFrom(args: {
    from: Address;
    to: Address;
    amount: bigint;
  }): Promise<PreparedFor<"ConfidentialTransferFrom">> {
    return this.sdk.prepare({
      kind: "ConfidentialTransferFrom",
      token: this.address,
      from: getAddress(args.from),
      to: getAddress(args.to),
      amount: args.amount,
    });
  }

  completeConfidentialTransferFrom(
    prepared: PreparedFor<"ConfidentialTransferFrom">,
    txHash: Hex,
  ): Promise<TransactionResult> {
    return this.sdk.completeFromTxHash(prepared, txHash);
  }

  prepareSetOperator(args: {
    operator: Address;
    until?: number;
  }): Promise<PreparedFor<"SetOperator">> {
    return this.sdk.prepare({
      kind: "SetOperator",
      token: this.address,
      operator: getAddress(args.operator),
      until: args.until,
    });
  }

  completeSetOperator(
    prepared: PreparedFor<"SetOperator">,
    txHash: Hex,
  ): Promise<TransactionResult> {
    return this.sdk.completeFromTxHash(prepared, txHash);
  }

  /**
   * First leg of the deferred two-phase unshield. The caller broadcasts the
   * resulting prepared tx, waits for the wrapper to emit `UnwrapRequested`,
   * extracts the `unwrapRequestId` from the event log, and then runs
   * {@link prepareFinalizeUnwrap} to authorize the underlying transfer.
   */
  prepareUnwrap(args: { to: Address; amount: bigint }): Promise<PreparedFor<"Unwrap">> {
    return this.sdk.prepare({
      kind: "Unwrap",
      token: this.address,
      to: getAddress(args.to),
      amount: args.amount,
    });
  }

  completeUnwrap(prepared: PreparedFor<"Unwrap">, txHash: Hex): Promise<TransactionResult> {
    return this.sdk.completeFromTxHash(prepared, txHash);
  }

  /**
   * Unshield-all variant of {@link prepareUnwrap} — uses the on-chain
   * confidential balance handle instead of an explicit amount. Pair with
   * {@link prepareFinalizeUnwrap} after the `UnwrapRequested` event lands.
   */
  prepareUnwrapAll(args: { to: Address }): Promise<PreparedFor<"UnwrapAll">> {
    return this.sdk.prepare({
      kind: "UnwrapAll",
      token: this.address,
      to: getAddress(args.to),
    });
  }

  completeUnwrapAll(prepared: PreparedFor<"UnwrapAll">, txHash: Hex): Promise<TransactionResult> {
    return this.sdk.completeFromTxHash(prepared, txHash);
  }

  /**
   * Second leg of the deferred two-phase unshield. After broadcasting the
   * {@link prepareUnwrap} (or {@link prepareUnwrapAll}) result, extract
   * `unwrapRequestId` from the `UnwrapRequested` event log and pass it
   * here. The SDK public-decrypts the handle during `prepare` and builds
   * the unsigned `wrapper.finalizeUnwrap(...)` tx the caller broadcasts.
   */
  prepareFinalizeUnwrap(args: {
    unwrapRequestIdOrAmount: Handle;
  }): Promise<PreparedFor<"FinalizeUnwrap">> {
    return this.sdk.prepare({
      kind: "FinalizeUnwrap",
      wrapper: this.wrapper,
      unwrapRequestIdOrAmount: args.unwrapRequestIdOrAmount,
    });
  }

  completeFinalizeUnwrap(
    prepared: PreparedFor<"FinalizeUnwrap">,
    txHash: Hex,
  ): Promise<TransactionResult> {
    return this.sdk.completeFromTxHash(prepared, txHash);
  }

  async prepareApproveUnderlying(args: {
    amount: bigint;
  }): Promise<PreparedFor<"ApproveUnderlying">> {
    // Fail fast on a wrong-chain signer so a custodian ceremony doesn't run
    // on an unsigned tx the network will later reject.
    await this.sdk.requireAlignedWalletAccount("prepareApproveUnderlying");
    const underlying = await this.#getUnderlying();
    return this.sdk.prepare({
      kind: "ApproveUnderlying",
      underlying,
      spender: this.wrapper,
      amount: args.amount,
    });
  }

  completeApproveUnderlying(
    prepared: PreparedFor<"ApproveUnderlying">,
    txHash: Hex,
  ): Promise<TransactionResult> {
    return this.sdk.completeFromTxHash(prepared, txHash);
  }

  async prepareDelegateDecryption(args: {
    delegateAddress: Address;
    expirationDate?: Date;
  }): Promise<PreparedFor<"DelegateDecryption">> {
    const aclAddress = await this.sdk.relayer.getAclAddress();
    return this.sdk.prepare({
      kind: "DelegateDecryption",
      aclAddress,
      contractAddress: this.address,
      delegateAddress: getAddress(args.delegateAddress),
      expirationDate: args.expirationDate,
    });
  }

  completeDelegateDecryption(
    prepared: PreparedFor<"DelegateDecryption">,
    txHash: Hex,
  ): Promise<TransactionResult> {
    return this.sdk.completeFromTxHash(prepared, txHash);
  }

  async prepareRevokeDelegation(args: {
    delegateAddress: Address;
  }): Promise<PreparedFor<"RevokeDelegation">> {
    const aclAddress = await this.sdk.relayer.getAclAddress();
    return this.sdk.prepare({
      kind: "RevokeDelegation",
      aclAddress,
      contractAddress: this.address,
      delegateAddress: getAddress(args.delegateAddress),
    });
  }

  completeRevokeDelegation(
    prepared: PreparedFor<"RevokeDelegation">,
    txHash: Hex,
  ): Promise<TransactionResult> {
    return this.sdk.completeFromTxHash(prepared, txHash);
  }

  /**
   * Build a deferred-signing plan for {@link shield}. Routes between the
   * single-tx ERC-1363 `transferAndCall` path and the two-tx
   * `approve + wrap` path the same way the atomic `shield` does. The caller
   * runs each step in order — preparing each one immediately before signing
   * keeps nonces fresh.
   *
   * @example
   * ```ts
   * const plan = await token.prepareShield(1_000n);
   * for (const step of plan.steps) {
   *   const prepared = await sdk.prepare(step);
   *   const signed   = await broadcaster.signTransaction(prepared.unsignedTx);
   *   await sdk.broadcast(prepared, signed);
   * }
   * ```
   */
  async prepareShield(amount: bigint, options?: { recipient?: Address }): Promise<ShieldPlan> {
    // Chain-align before any custodian round-trip so a wrong-chain plan
    // never reaches the broadcaster.
    const account = await this.sdk.requireAlignedWalletAccount("prepareShield");
    const userAddress = getAddress(account.address);
    const recipient = options?.recipient ? getAddress(options.recipient) : userAddress;
    const underlying = await this.#getUnderlying();
    const isPayable = await this.isPayable();
    if (isPayable) {
      const recipientData: Hex = recipient === userAddress ? "0x" : recipient;
      return {
        path: "transferAndCall",
        steps: [
          {
            kind: "TransferAndCall",
            underlying,
            wrapper: this.wrapper,
            amount,
            recipientData,
          },
        ],
      };
    }
    const wrapStep = {
      kind: "Wrap",
      wrapper: this.wrapper,
      to: recipient,
      amount,
    } as const;
    // Mirror atomic `#ensureAllowance`: skip approve if existing allowance
    // is sufficient; otherwise issue a zero-reset first when the current
    // allowance is non-zero (USDT-style and ERC-20 approve-race safety).
    const allowance = await this.sdk.provider.readContract(
      allowanceContract(underlying, userAddress, this.wrapper),
    );
    if (allowance >= amount) {
      return { path: "approveAndWrap", steps: [wrapStep] };
    }
    const approveStep = {
      kind: "ApproveUnderlying",
      underlying,
      spender: this.wrapper,
      amount,
    } as const;
    if (allowance > 0n) {
      const resetStep = {
        kind: "ApproveUnderlying",
        underlying,
        spender: this.wrapper,
        amount: 0n,
      } as const;
      return { path: "approveAndWrap", steps: [resetStep, approveStep, wrapStep] };
    }
    return { path: "approveAndWrap", steps: [approveStep, wrapStep] };
  }

  // BATCH DELEGATION

  /**
   * Delegate decryption rights across multiple tokens in parallel.
   * Returns a per-token result map with partial success semantics.
   *
   * @param tokens - Array of Token instances to delegate on.
   * @param delegateAddress - Address to delegate decryption rights to.
   * @param expirationDate - Optional expiration date.
   * @returns Map from token address to TransactionResult or ZamaError.
   */
  static async batchDelegateDecryption({
    tokens,
    delegateAddress,
    expirationDate,
  }: {
    tokens: Token[];
    delegateAddress: Address;
    expirationDate?: Date;
  }): Promise<Map<Address, TransactionResult | ZamaError>> {
    return Token.#batchDelegationOp(
      tokens,
      (t) => t.delegateDecryption({ delegateAddress, expirationDate }),
      "Delegation failed",
    );
  }

  /**
   * Revoke delegation across multiple tokens in parallel.
   * Returns a per-token result map with partial success semantics.
   *
   * @param tokens - Array of Token instances to revoke delegation on.
   * @param delegateAddress - Address to revoke delegation from.
   * @returns Map from token address to TransactionResult or ZamaError.
   */
  static async batchRevokeDelegation({
    tokens,
    delegateAddress,
  }: {
    tokens: Token[];
    delegateAddress: Address;
  }): Promise<Map<Address, TransactionResult | ZamaError>> {
    return Token.#batchDelegationOp(
      tokens,
      (t) => t.revokeDelegation({ delegateAddress }),
      "Revoke delegation failed",
    );
  }

  static async #batchDelegationOp(
    tokens: Token[],
    op: (token: Token) => Promise<TransactionResult>,
    errorMessage: string,
  ): Promise<Map<Address, TransactionResult | ZamaError>> {
    const results = new Map<Address, TransactionResult | ZamaError>();
    // Run sequentially: parallel writeContract calls from the same signer
    // cause nonce contention. The value of the batch API is partial-success
    // semantics (per-token results without throwing), not parallelism.
    for (let i = 0; i < tokens.length; i++) {
      try {
        results.set(tokens[i]!.address, await op(tokens[i]!));
      } catch (error) {
        if (error instanceof ZamaError) {
          results.set(tokens[i]!.address, error);
        } else {
          results.set(
            tokens[i]!.address,
            new TransactionRevertedError(errorMessage, {
              cause: error,
            }),
          );
        }
      }
    }
    return results;
  }

  // PRIVATE HELPERS

  /**
   * Pre-flight check: decrypt the confidential balance and compare against the
   * requested amount. If credentials are cached the decrypt happens silently;
   * if not, throws {@link BalanceCheckUnavailableError} instead of triggering
   * a surprise EIP-712 popup.
   */
  async #assertConfidentialBalance(amount: bigint): Promise<void> {
    if (amount === 0n) {
      return;
    }

    let balance: bigint;
    try {
      const account = await this.sdk.requireAlignedWalletAccount("assertConfidentialBalance");
      balance = await this.balanceOf(getAddress(account.address));
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new BalanceCheckUnavailableError(`Balance validation failed (token: ${this.address})`, {
        cause: error,
      });
    }

    if (balance < amount) {
      throw new InsufficientConfidentialBalanceError(
        `Insufficient confidential balance: requested ${amount}, available ${balance} (token: ${this.address})`,
        { requested: amount, available: balance, token: this.address },
      );
    }
  }

  async #waitAndFinalizeUnshield(
    unshieldHash: Hex,
    operationId: string,
    callbacks: UnshieldCallbacks | undefined,
  ): Promise<TransactionResult> {
    this.emit({
      type: ZamaSDKEvents.UnshieldPhase1Submitted,
      txHash: unshieldHash,
      operationId,
    });
    let receipt;
    try {
      receipt = await this.sdk.provider.waitForTransactionReceipt(unshieldHash);
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("Failed to get unshield receipt", {
        cause: error,
      });
    }
    const event = findUnwrapRequested(receipt.logs);
    if (!event) {
      throw new TransactionRevertedError("No UnwrapRequested event found in unshield receipt");
    }
    this.emit({ type: ZamaSDKEvents.UnshieldPhase2Started, operationId });
    safeCallback(() => callbacks?.onFinalizing?.());
    const finalizeResult = await this.finalizeUnwrap(
      event.unwrapRequestId ?? event.encryptedAmount,
    );
    this.emit({
      type: ZamaSDKEvents.UnshieldPhase2Submitted,
      txHash: finalizeResult.txHash,
      operationId,
    });
    safeCallback(() => callbacks?.onFinalizeSubmitted?.(finalizeResult.txHash));
    return finalizeResult;
  }

  async #ensureAllowance(
    amount: bigint,
    maxApproval: boolean,
    callbacks?: ShieldCallbacks,
  ): Promise<void> {
    const signer = this.sdk.requireSigner("approveUnderlying");
    assertWriteContract(signer, "approveUnderlying");
    const underlying = await this.#getUnderlying();
    const account = await this.sdk.requireAlignedWalletAccount("approveUnderlying");
    const userAddress = getAddress(account.address);
    const allowance = await this.sdk.provider.readContract(
      allowanceContract(underlying, userAddress, this.wrapper),
    );

    if (allowance >= amount) {
      return;
    }

    try {
      // Reset to zero first when there's an existing non-zero allowance.
      // Required by non-standard tokens like USDT, and also mitigates the
      // ERC-20 approve race condition for all tokens.
      if (allowance > 0n) {
        const resetHash = await signer.writeContract(approveContract(underlying, this.wrapper, 0n));
        await this.sdk.provider.waitForTransactionReceipt(resetHash);
      }

      const approvalAmount = maxApproval ? 2n ** 256n - 1n : amount;

      const txHash = await signer.writeContract(
        approveContract(underlying, this.wrapper, approvalAmount),
      );
      this.emit({ type: ZamaSDKEvents.ApproveUnderlyingSubmitted, txHash });
      safeCallback(() => callbacks?.onApprovalSubmitted?.(txHash));
      await this.sdk.provider.waitForTransactionReceipt(txHash);
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new ApprovalFailedError("ERC-20 approval failed", {
        cause: error,
      });
    }
  }
}

/**
 * Invoke a callback inside a try/catch so a throwing listener
 * can never break the unshield flow (unwrap already on-chain).
 */
function safeCallback(fn: () => void): void {
  try {
    fn();
  } catch (error) {
    console.warn("[zama-sdk] Callback threw:", error);
  }
}
