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
import type { EncryptedValue } from "../relayer/relayer-sdk.types";
import {
  DecryptionFailedError,
  ERC20ReadFailedError,
  EncryptionFailedError,
  InsufficientERC20BalanceError,
  SignerNotConfiguredError,
  TransactionRevertedError,
  ZamaError,
} from "../errors";
import { isEncryptedValueZero } from "../utils/handles";
import { toError } from "../utils";
import { requireAlignedWalletAccount, requireChainAlignment } from "../utils/alignment";
import { assertBigint, assertNonNullable } from "../utils/assertions";
import { swallow } from "../utils/swallow";
import { clearPendingUnshield, loadPendingUnshield, savePendingUnshield } from "./pending-unshield";
import { Token } from "./token";
import type {
  ApproveUnderlyingRequest,
  GenericSigner,
  ShieldCallbacks,
  ShieldOptions,
  TransactionResult,
  TransferAndCallRequest,
  UnshieldCallbacks,
  UnshieldOptions,
  WrapRequest,
} from "../types";

/**
 * Multi-step shield plan returned by {@link WrappedToken.prepareShield}. Each
 * step is a `TransactionPrepareRequest` the caller passes to
 * {@link Offline.prepare} in order. Preparing immediately before signing
 * keeps nonces fresh.
 *
 * Non-ERC-1363 underlyings need an `approve` (sometimes preceded by a
 * USDT-style zero-reset) followed by a `wrap`; the routing decision depends
 * on an on-chain `isPayable()` probe + a live `allowance()` read. The
 * discriminated tuple shape below makes (path, steps.length) inseparable at
 * the type level — `transferAndCall`-with-two-steps and similar illegal
 * combinations are unrepresentable.
 *
 * The `approveAndWrap` arm has three sub-shapes mirroring the atomic
 * `#ensureAllowance` decision tree:
 *
 * - `[Wrap]` — the user already has sufficient allowance; skip approve.
 * - `[Approve, Wrap]` — current allowance is zero; approve target, then wrap.
 * - `[Approve(0), Approve, Wrap]` — non-zero allowance below target. Reset
 *   first because USDT-style tokens revert on a non-zero → non-zero approve
 *   and the zero-reset also mitigates the ERC-20 approve race.
 */
export type ShieldPlan =
  | { readonly path: "transferAndCall"; readonly steps: readonly [TransferAndCallRequest] }
  | {
      readonly path: "approveAndWrap";
      readonly steps:
        | readonly [WrapRequest]
        | readonly [ApproveUnderlyingRequest, WrapRequest]
        | readonly [ApproveUnderlyingRequest, ApproveUnderlyingRequest, WrapRequest];
    };

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

  /** Resolve `sdk.signer` or throw {@link SignerNotConfiguredError} tagged with `operation`. */
  #requireSigner(operation: string): GenericSigner {
    try {
      assertNonNullable(this.sdk.signer, "WrappedToken.sdk.signer");
      return this.sdk.signer;
    } catch (cause) {
      throw new SignerNotConfiguredError(operation, { cause });
    }
  }

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
   * @throws if signer and provider are on different chains. {@link ChainMismatchError}
   * @throws if the ERC-20 balance is less than `amount`. {@link InsufficientERC20BalanceError}
   * @throws if the ERC-20 approval or shield transaction reverts. {@link TransactionRevertedError}
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
    this.#requireSigner("shield");
    const recipient = options?.to ? getAddress(options.to) : userAddress;
    // ERC7984ERC20Wrapper.onTransferReceived decodes the recipient via
    // `address(bytes20(data))` — i.e. the first 20 bytes of `data`. We pass
    // the raw 20-byte address (not ABI-encoded), and the empty payload `0x`
    // for self-shield so the wrapper falls back to `from`.
    const data: Hex = recipient === userAddress ? "0x" : recipient;

    return this.submitTransaction({
      operation: "shield:transferAndCall",
      config: transferAndCallContract(underlying, this.address, amount, data),
      onSubmitted: options?.onShieldSubmitted,
    });
  }

  async #shieldViaApproveAndWrap(
    amount: bigint,
    userAddress: Address,
    options?: ShieldOptions,
  ): Promise<TransactionResult> {
    this.#requireSigner("shield");
    const strategy = options?.approvalStrategy ?? "exact";
    if (strategy !== "skip") {
      await this.#ensureAllowance(amount, strategy === "max", options);
    }
    const recipient = options?.to ? getAddress(options.to) : userAddress;
    return this.submitTransaction({
      operation: "shield:approveAndWrap",
      config: wrapContract(this.address, recipient, amount),
      onSubmitted: options?.onShieldSubmitted,
    });
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
  /**
   * Build an offline-signing plan for {@link shield}. Routes between the
   * single-tx ERC-1363 `transferAndCall` path and the two-tx `approve + wrap`
   * path the same way the atomic `shield` does. The caller runs each step in
   * order — preparing each one immediately before signing keeps nonces fresh.
   *
   * Signer-optional: works without a configured signer (the canonical
   * cross-process custody shape).
   *
   * @example
   * ```ts
   * const plan = await wrappedToken.prepareShield(1_000n);
   * for (const step of plan.steps) {
   *   const prepared = await sdk.offlineSigning.prepare(step);
   *   const signed   = await externalSigner.signTransaction(prepared.unsignedTx);
   *   await sdk.offlineSigning.broadcast(prepared, signed);
   * }
   * ```
   */
  async prepareShield(amount: bigint, options?: { recipient?: Address }): Promise<ShieldPlan> {
    const account = await requireAlignedWalletAccount(
      "prepareShield",
      this.sdk.signer,
      this.sdk.provider,
    );
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
            from: userAddress,
            underlying,
            wrapper: this.address,
            amount,
            recipientData,
          },
        ],
      };
    }
    const wrapStep = {
      kind: "Wrap",
      from: userAddress,
      wrapper: this.address,
      to: recipient,
      amount,
    } as const;
    const allowance = await this.sdk.provider.readContract(
      allowanceContract(underlying, userAddress, this.address),
    );
    if (allowance >= amount) {
      return { path: "approveAndWrap", steps: [wrapStep] };
    }
    const approveStep = {
      kind: "ApproveUnderlying",
      from: userAddress,
      underlying,
      spender: this.address,
      amount,
    } as const;
    if (allowance > 0n) {
      const resetStep = {
        kind: "ApproveUnderlying",
        from: userAddress,
        underlying,
        spender: this.address,
        amount: 0n,
      } as const;
      return { path: "approveAndWrap", steps: [resetStep, approveStep, wrapStep] };
    }
    return { path: "approveAndWrap", steps: [approveStep, wrapStep] };
  }

  async approveUnderlying(amount?: bigint): Promise<TransactionResult> {
    this.#requireSigner("approveUnderlying");
    const account = await requireAlignedWalletAccount(
      "approveUnderlying",
      this.sdk.signer,
      this.sdk.provider,
    );
    const underlying = await this.#getUnderlying();
    const userAddress = getAddress(account.address);

    const approvalAmount = amount ?? 2n ** 256n - 1n;

    if (approvalAmount > 0n) {
      const currentAllowance = await this.sdk.provider.readContract(
        allowanceContract(underlying, userAddress, this.address),
      );

      if (currentAllowance > 0n) {
        await this.submitTransaction({
          operation: "approveUnderlying:reset",
          config: approveContract(underlying, this.address, 0n),
        });
      }
    }

    return this.submitTransaction({
      operation: "approveUnderlying",
      config: approveContract(underlying, this.address, approvalAmount),
    });
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

    const callbacks: UnshieldCallbacks = { onFinalizing, onFinalizeSubmitted };
    const operationId = crypto.randomUUID();
    const unwrapResult = await this.unwrap(amount);
    void swallow(
      "unshield: onUnwrapSubmitted",
      () => onUnwrapSubmitted?.(unwrapResult.txHash),
      this.sdk.logger,
    );
    return this.#waitAndFinalizeUnshield(unwrapResult.txHash, operationId, callbacks);
  }

  /**
   * Unshield the entire balance and finalize in one call.
   * Orchestrates: unshieldAll → wait for receipt → parse event → finalize.
   *
   * @param callbacks - Optional progress callbacks for each phase.
   * @returns The finalize transaction hash and mined receipt.
   * @throws if the balance is zero. {@link DecryptionFailedError}
   *
   * @example
   * ```ts
   * const txHash = await wrappedToken.unshieldAll();
   * ```
   */
  async unshieldAll(callbacks?: UnshieldCallbacks): Promise<TransactionResult> {
    const operationId = crypto.randomUUID();
    const unwrapResult = await this.unwrapAll();
    void swallow(
      "unshieldAll: onUnwrapSubmitted",
      () => callbacks?.onUnwrapSubmitted?.(unwrapResult.txHash),
      this.sdk.logger,
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

  /**
   * Return the unwrap tx hash of an unshield that was interrupted between its
   * two phases, or `null` if none is pending for this wrapper.
   *
   * The SDK persists this automatically when {@link unshield}/{@link unshieldAll}
   * submit phase 1, and clears it once phase 2 finalizes. Use the returned hash
   * to surface a "resume" affordance, then pass it to {@link resumeUnshield}.
   * Resuming is intentionally caller-driven — auto-resuming on load would fire a
   * wallet transaction unprompted.
   *
   * @returns The pending unwrap tx hash, or `null`.
   *
   * @example
   * ```ts
   * const unwrapTxHash = await wrappedToken.getPendingUnshield();
   * if (unwrapTxHash) await wrappedToken.resumeUnshield(unwrapTxHash);
   * ```
   */
  async getPendingUnshield(): Promise<Hex | null> {
    return loadPendingUnshield(this.sdk.storage, this.address);
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
    this.#requireSigner("unwrap");
    const account = await requireAlignedWalletAccount("unwrap", this.sdk.signer, this.sdk.provider);
    const userAddress = getAddress(account.address);

    const { encryptedValues, inputProof } = await this.sdk.encrypt({
      values: [{ value: amount, type: "euint64" }],
      contractAddress: this.address,
      userAddress,
    });

    const [encryptedAmount] = encryptedValues;
    if (!encryptedAmount) {
      throw new EncryptionFailedError("Encryption returned no encrypted values");
    }

    return this.submitTransaction({
      operation: "unwrap",
      config: unwrapContract(this.address, userAddress, userAddress, encryptedAmount, inputProof),
    });
  }

  /**
   * Request an unwrap for the entire confidential balance.
   * Uses the on-chain encrypted balance directly (no encryption needed).
   * Throws if the balance is zero.
   *
   * @returns The transaction hash and mined receipt.
   * @throws if the balance is zero. {@link DecryptionFailedError}
   *
   * @example
   * ```ts
   * const txHash = await wrappedToken.unwrapAll();
   * ```
   */
  async unwrapAll(): Promise<TransactionResult> {
    this.#requireSigner("unwrapAll");
    const account = await requireAlignedWalletAccount(
      "unwrapAll",
      this.sdk.signer,
      this.sdk.provider,
    );
    const userAddress = getAddress(account.address);
    const encryptedValue = await this.readConfidentialBalanceOf(userAddress);

    if (isEncryptedValueZero(encryptedValue)) {
      throw new DecryptionFailedError("Cannot unshield: balance is zero");
    }

    return this.submitTransaction({
      operation: "unwrapAll",
      config: unwrapFromBalanceContract(this.address, userAddress, userAddress, encryptedValue),
    });
  }

  /**
   * Complete an unwrap by providing the public decryption proof.
   * Call this after an unshield request has been processed on-chain.
   *
   * @param unwrapRequestId - `unwrapRequestId` from the `UnwrapRequested` event.
   * @returns The transaction hash and mined receipt.
   *
   * @example
   * ```ts
   * const event = findUnwrapRequested(receipt.logs);
   * const txHash = await wrappedToken.finalizeUnwrap(event.unwrapRequestId);
   * ```
   */
  async finalizeUnwrap(unwrapRequestId: EncryptedValue): Promise<TransactionResult> {
    this.#requireSigner("finalizeUnwrap");
    await requireChainAlignment("finalizeUnwrap", this.sdk.signer, this.sdk.provider);
    const result = await this.sdk.decryption.decryptPublicValues([unwrapRequestId]);
    const clearValue = result.clearValues[unwrapRequestId];
    assertBigint(clearValue, "finalizeUnwrap: clearValue");
    return this.submitTransaction({
      operation: "finalizeUnwrap",
      config: finalizeUnwrapContract(
        this.address,
        unwrapRequestId,
        clearValue,
        result.decryptionProof,
      ),
    });
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
    this.emit({ type: ZamaSDKEvents.UnshieldPhase1Submitted, txHash: unshieldHash, operationId });
    await swallow(
      "unshield: savePendingUnshield",
      () => savePendingUnshield(this.sdk.storage, this.address, unshieldHash),
      this.sdk.logger,
    );
    let receipt;
    try {
      receipt = await this.sdk.provider.waitForTransactionReceipt(unshieldHash);
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("Failed to get unshield receipt", { cause: error });
    }
    const event = findUnwrapRequested(receipt.logs);
    if (!event) {
      throw new TransactionRevertedError("No UnwrapRequested event found in unshield receipt");
    }
    this.emit({ type: ZamaSDKEvents.UnshieldPhase2Started, operationId });
    void swallow("unshield: onFinalizing", () => callbacks?.onFinalizing?.(), this.sdk.logger);
    const finalizeResult = await this.finalizeUnwrap(
      event.unwrapRequestId ?? event.encryptedAmount,
    );
    this.emit({
      type: ZamaSDKEvents.UnshieldPhase2Submitted,
      txHash: finalizeResult.txHash,
      operationId,
    });
    void swallow(
      "unshield: onFinalizeSubmitted",
      () => callbacks?.onFinalizeSubmitted?.(finalizeResult.txHash),
      this.sdk.logger,
    );
    // Phase 2 landed: the persisted recovery state is no longer needed.
    await swallow(
      "unshield: clearPendingUnshield",
      () => clearPendingUnshield(this.sdk.storage, this.address),
      this.sdk.logger,
    );
    return finalizeResult;
  }

  async #ensureAllowance(
    amount: bigint,
    maxApproval: boolean,
    callbacks?: ShieldCallbacks,
  ): Promise<void> {
    this.#requireSigner("approveUnderlying");
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

    // Reset to zero first when there's an existing non-zero allowance.
    // Required by non-standard tokens like USDT, and also mitigates the
    // ERC-20 approve race condition for all tokens.
    if (allowance > 0n) {
      await this.submitTransaction({
        operation: "approveUnderlying:reset",
        config: approveContract(underlying, this.address, 0n),
      });
    }

    const approvalAmount = maxApproval ? 2n ** 256n - 1n : amount;

    await this.submitTransaction({
      operation: "approveUnderlying",
      config: approveContract(underlying, this.address, approvalAmount),
      onSubmitted: callbacks?.onApprovalSubmitted,
    });
  }
}
