import { type Address, getAddress, type Hex } from "viem";
import {
  allowanceContract,
  approveContract,
  balanceOfContract,
  finalizeUnwrapContract,
  isPayableTokenContract,
  transferAndCallContract,
  underlyingContract,
  unwrapContract,
  unwrapFromBalanceContract,
  wrapContract,
} from "../contracts";
import { findUnwrapRequested } from "../events/onchain-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { Handle } from "../relayer/relayer-sdk.types";
import {
  ApprovalFailedError,
  DecryptionFailedError,
  ERC20ReadFailedError,
  EncryptionFailedError,
  InsufficientERC20BalanceError,
  TransactionRevertedError,
  ZamaError,
} from "../errors";
import { isZeroHandle } from "../utils/handles";
import { toError } from "../utils";
import { requireAlignedWalletAccount, requireChainAlignment } from "../utils/alignment";
import { assertBigint } from "../utils/assertions";
import { swallow } from "../utils/swallow";
import { Token } from "./token";
import type {
  ShieldCallbacks,
  ShieldOptions,
  TransactionResult,
  UnshieldCallbacks,
  UnshieldOptions,
} from "../types";

/**
 * Confidential ERC-20 wrapper (ERC-7984 ERC20Wrapper).
 *
 * Extends {@link Token} with wrapper-specific operations:
 * - `shield` / `unshield` — convert between the underlying ERC-20 and confidential balance
 * - `unwrap` / `unwrapAll` / `finalizeUnwrap` — low-level two-phase primitives
 * - `underlying` / `allowance` — wrapper reads
 *
 * `WrappedToken.address` is the wrapper contract address itself — the wrapper
 * IS the confidential token.
 */
export class WrappedToken extends Token {
  #underlying: Address | undefined;
  #underlyingPromise: Promise<Address> | null = null;
  #isPayable: boolean | null = null;

  // WRAPPER READS

  /**
   * Read the underlying ERC-20 token address from the wrapper contract.
   *
   * @returns The underlying ERC-20 token address.
   */
  async underlying(): Promise<Address> {
    return this.#getUnderlying();
  }

  /**
   * Check whether the underlying ERC-20 supports ERC-1363 (payable token).
   * Result is cached per WrappedToken instance (negative results included):
   * once we know an underlying does not support ERC-1363, subsequent shields
   * go straight to the `approve` + `wrap` path without re-probing.
   */
  async isPayable(): Promise<boolean> {
    if (this.#isPayable !== null) {
      return this.#isPayable;
    }
    try {
      const underlying = await this.#getUnderlying();
      this.#isPayable = await this.sdk.provider.readContract(isPayableTokenContract(underlying));
    } catch {
      this.#isPayable = false;
    }
    return this.#isPayable;
  }

  /**
   * Read the ERC-20 allowance granted by `owner` to this wrapper for the
   * underlying token.
   *
   * @param owner - The owner address whose allowance to read.
   * @returns The current allowance as a bigint.
   */
  async allowance(owner: Address): Promise<bigint> {
    const underlying = await this.#getUnderlying();
    return this.sdk.provider.readContract(
      allowanceContract(underlying, getAddress(owner), this.address),
    );
  }

  // SHIELD (ERC-20 → confidential)

  /**
   * Shield public ERC-20 tokens into confidential tokens.
   *
   * The execution path is decided automatically by ERC-165 introspection on
   * the underlying ERC-20:
   * - **`transferAndCall`** (single tx): when the underlying supports
   *   ERC-1363, no approval is required — the wrapper's `onTransferReceived`
   *   callback mints confidential tokens directly. `approvalStrategy` is
   *   **ignored** on this path. See {@link ShieldPath}.
   * - **`approveAndWrap`** (two-tx fallback): otherwise, an `approve` is
   *   followed by a `wrap`. Approval is controlled by `approvalStrategy`
   *   (`"exact"` by default, `"max"` for unlimited, `"skip"` to opt out).
   *
   * The ERC-20 balance is validated before submitting (public read, no
   * signing required) so the call works for all wallet types, including
   * smart wallets.
   *
   * @param amount - The plaintext amount to shield.
   * @param options - Optional: `approvalStrategy`, `to`, callbacks.
   * @returns The transaction hash and mined receipt.
   * @throws {@link ChainMismatchError} if signer and provider are on different chains.
   * @throws {@link InsufficientERC20BalanceError} if the ERC-20 balance is less than `amount`.
   * @throws {@link ApprovalFailedError} if the ERC-20 approval step fails (approveAndWrap path).
   * @throws {@link TransactionRevertedError} if the shield transaction reverts.
   *
   * @example
   * ```ts
   * const txHash = await wrappedToken.shield(1000n);
   * ```
   */
  async shield(amount: bigint, options?: ShieldOptions): Promise<TransactionResult> {
    const account = await requireAlignedWalletAccount("shield", this.sdk.signer, this.sdk.provider);

    const isPayableToken = await this.isPayable();
    const underlying = await this.#getUnderlying();
    const userAddress = getAddress(account.address);

    // ERC-20 balance check always runs (public read, no signing needed, works for all wallet types)
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
    const recipient = options?.to ? getAddress(options.to) : userAddress;
    // ERC7984ERC20Wrapper.onTransferReceived decodes the recipient via
    // `address(bytes20(data))` — i.e. the first 20 bytes of `data`. We pass
    // the raw 20-byte address (not ABI-encoded), and the empty payload `0x`
    // for self-shield so the wrapper falls back to `from`.
    const data: Hex = recipient === userAddress ? "0x" : recipient;

    try {
      const txHash = await signer.writeContract(
        transferAndCallContract(underlying, this.address, amount, data),
      );
      this.emit({
        type: ZamaSDKEvents.ShieldSubmitted,
        txHash,
        shieldPath: "transferAndCall",
      });
      void swallow("shield: onShieldSubmitted", () => options?.onShieldSubmitted?.(txHash));
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
    const strategy = options?.approvalStrategy ?? "exact";
    if (strategy !== "skip") {
      await this.#ensureAllowance(amount, strategy === "max", options);
    }

    try {
      const recipient = options?.to ? getAddress(options.to) : userAddress;
      const txHash = await signer.writeContract(wrapContract(this.address, recipient, amount));
      this.emit({
        type: ZamaSDKEvents.ShieldSubmitted,
        txHash,
        shieldPath: "approveAndWrap",
      });
      void swallow("shield: onShieldSubmitted", () => options?.onShieldSubmitted?.(txHash));
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
   * Approve this wrapper contract to spend the underlying ERC-20.
   * Defaults to max uint256. Resets to zero first if there's an existing
   * non-zero allowance (required by tokens like USDT).
   *
   * @param amount - Optional approval amount. Defaults to max uint256.
   * @returns The transaction hash and mined receipt.
   *
   * @example
   * ```ts
   * await wrappedToken.approveUnderlying(); // max approval
   * await wrappedToken.approveUnderlying(1000n); // exact amount
   * ```
   */
  async approveUnderlying(amount?: bigint): Promise<TransactionResult> {
    const signer = this.sdk.requireSigner("approveUnderlying");
    const account = await requireAlignedWalletAccount(
      "approveUnderlying",
      this.sdk.signer,
      this.sdk.provider,
    );
    const underlying = await this.#getUnderlying();
    const userAddress = getAddress(account.address);

    const approvalAmount = amount ?? 2n ** 256n - 1n;

    try {
      if (approvalAmount > 0n) {
        const currentAllowance = await this.sdk.provider.readContract(
          allowanceContract(underlying, userAddress, this.address),
        );

        if (currentAllowance > 0n) {
          await signer.writeContract(approveContract(underlying, this.address, 0n));
        }
      }

      const txHash = await signer.writeContract(
        approveContract(underlying, this.address, approvalAmount),
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

  // UNSHIELD (confidential → ERC-20)

  /**
   * Unshield a specific amount and finalize in one call.
   * Orchestrates: unshield → wait for receipt → parse event → finalize.
   *
   * By default, the SDK validates the confidential balance before submitting.
   * Set `skipBalanceCheck: true` to bypass this validation (e.g. for smart wallets).
   *
   * @param amount - The plaintext amount to unshield.
   * @param options - Optional: `skipBalanceCheck` (default `false`), callbacks.
   * @returns The finalize transaction hash and mined receipt.
   *
   * @example
   * ```ts
   * const txHash = await wrappedToken.unshield(500n);
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
      await this.assertConfidentialBalance(amount);
    }

    const callbacks: UnshieldCallbacks = {
      onFinalizing,
      onFinalizeSubmitted,
    };
    const operationId = crypto.randomUUID();
    const unwrapResult = await this.unwrap(amount);
    void swallow("unshield: onUnwrapSubmitted", () => onUnwrapSubmitted?.(unwrapResult.txHash));
    return this.#waitAndFinalizeUnshield(unwrapResult.txHash, operationId, callbacks);
  }

  /**
   * Unshield the entire balance and finalize in one call.
   * Orchestrates: unshieldAll → wait for receipt → parse event → finalize.
   *
   * @param callbacks - Optional progress callbacks for each phase.
   * @returns The finalize transaction hash and mined receipt.
   * @throws {@link DecryptionFailedError} if the balance is zero.
   *
   * @example
   * ```ts
   * const txHash = await wrappedToken.unshieldAll();
   * ```
   */
  async unshieldAll(callbacks?: UnshieldCallbacks): Promise<TransactionResult> {
    const operationId = crypto.randomUUID();
    const unwrapResult = await this.unwrapAll();
    void swallow("unshieldAll: onUnwrapSubmitted", () =>
      callbacks?.onUnwrapSubmitted?.(unwrapResult.txHash),
    );
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
   *
   * @example
   * ```ts
   * const txHash = await wrappedToken.resumeUnshield(previousUnwrapTxHash);
   * ```
   */
  async resumeUnshield(
    unwrapTxHash: Hex,
    callbacks?: UnshieldCallbacks,
  ): Promise<TransactionResult> {
    return this.#waitAndFinalizeUnshield(unwrapTxHash, crypto.randomUUID(), callbacks);
  }

  // UNSHIELD LOW-LEVEL PRIMITIVES

  /**
   * Request an unwrap for a specific amount. Encrypts the amount first.
   * Call {@link finalizeUnwrap} after the request is processed on-chain.
   *
   * @param amount - The plaintext amount to unwrap (encrypted automatically).
   * @returns The transaction hash and mined receipt.
   *
   * @example
   * ```ts
   * const txHash = await wrappedToken.unwrap(500n);
   * ```
   */
  async unwrap(amount: bigint): Promise<TransactionResult> {
    const signer = this.sdk.requireSigner("unwrap");
    const account = await requireAlignedWalletAccount("unwrap", this.sdk.signer, this.sdk.provider);
    const userAddress = getAddress(account.address);

    const { handles, inputProof } = await this.sdk.encrypt({
      values: [{ value: amount, type: "euint64" }],
      contractAddress: this.address,
      userAddress,
    });

    const [handle] = handles;
    if (!handle) {
      throw new EncryptionFailedError("Encryption returned no handles");
    }

    try {
      const txHash = await signer.writeContract(
        unwrapContract(this.address, userAddress, userAddress, handle, inputProof),
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
      throw new TransactionRevertedError("Unwrap transaction failed", {
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
   * @throws {@link DecryptionFailedError} if the balance is zero.
   *
   * @example
   * ```ts
   * const txHash = await wrappedToken.unwrapAll();
   * ```
   */
  async unwrapAll(): Promise<TransactionResult> {
    const signer = this.sdk.requireSigner("unwrapAll");
    const account = await requireAlignedWalletAccount(
      "unwrapAll",
      this.sdk.signer,
      this.sdk.provider,
    );
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
      throw new TransactionRevertedError("UnwrapAll transaction failed", {
        cause: error,
      });
    }
  }

  /**
   * Complete an unwrap by providing the public decryption proof.
   * Call this after an unshield request has been processed on-chain.
   *
   * @param unwrapRequestIdOrAmount - `unwrapRequestId` from upgraded wrappers,
   *   or the encrypted amount handle from legacy wrappers.
   * @returns The transaction hash and mined receipt.
   *
   * @example
   * ```ts
   * const event = findUnwrapRequested(receipt.logs);
   * const txHash = await wrappedToken.finalizeUnwrap(
   *   event.unwrapRequestId ?? event.encryptedAmount,
   * );
   * ```
   */
  async finalizeUnwrap(unwrapRequestIdOrAmount: Handle): Promise<TransactionResult> {
    const signer = this.sdk.requireSigner("finalizeUnwrap");
    await requireChainAlignment("finalizeUnwrap", this.sdk.signer, this.sdk.provider);
    const result = await this.sdk.publicDecrypt([unwrapRequestIdOrAmount]);
    const clearValue = result.clearValues[unwrapRequestIdOrAmount];
    assertBigint(clearValue, "finalizeUnwrap: clearValue");
    try {
      const txHash = await signer.writeContract(
        finalizeUnwrapContract(
          this.address,
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

  // PRIVATE HELPERS

  async #getUnderlying(): Promise<Address> {
    if (this.#underlying !== undefined) {
      return this.#underlying;
    }
    if (!this.#underlyingPromise) {
      this.#underlyingPromise = this.sdk.provider
        .readContract(underlyingContract(this.address))
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
    void swallow("unshield: onFinalizing", () => callbacks?.onFinalizing?.());
    const finalizeResult = await this.finalizeUnwrap(
      event.unwrapRequestId ?? event.encryptedAmount,
    );
    this.emit({
      type: ZamaSDKEvents.UnshieldPhase2Submitted,
      txHash: finalizeResult.txHash,
      operationId,
    });
    void swallow("unshield: onFinalizeSubmitted", () =>
      callbacks?.onFinalizeSubmitted?.(finalizeResult.txHash),
    );
    return finalizeResult;
  }

  async #ensureAllowance(
    amount: bigint,
    maxApproval: boolean,
    callbacks?: ShieldCallbacks,
  ): Promise<void> {
    const signer = this.sdk.requireSigner("approveUnderlying");
    const underlying = await this.#getUnderlying();
    const account = await requireAlignedWalletAccount(
      "approveUnderlying",
      this.sdk.signer,
      this.sdk.provider,
    );
    const userAddress = getAddress(account.address);
    const allowance = await this.sdk.provider.readContract(
      allowanceContract(underlying, userAddress, this.address),
    );

    if (allowance >= amount) {
      return;
    }

    try {
      // Reset to zero first when there's an existing non-zero allowance.
      // Required by non-standard tokens like USDT, and also mitigates the
      // ERC-20 approve race condition for all tokens.
      if (allowance > 0n) {
        const resetHash = await signer.writeContract(approveContract(underlying, this.address, 0n));
        await this.sdk.provider.waitForTransactionReceipt(resetHash);
      }

      const approvalAmount = maxApproval ? 2n ** 256n - 1n : amount;

      const txHash = await signer.writeContract(
        approveContract(underlying, this.address, approvalAmount),
      );
      this.emit({ type: ZamaSDKEvents.ApproveUnderlyingSubmitted, txHash });
      void swallow("shield: onApprovalSubmitted", () => callbacks?.onApprovalSubmitted?.(txHash));
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
