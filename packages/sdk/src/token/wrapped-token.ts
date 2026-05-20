import { type Address, getAddress, type Hex, toHex } from "viem";
import {
  buildFinalizeUnwrapIntent,
  buildShieldViaTransferAndCallIntent,
  buildShieldViaWrapIntent,
  buildUnwrapAllIntent,
  buildUnwrapIntent,
  type ClearSigningEncryptedValue,
  type ClearSigningIntent,
} from "../clear-signing";
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
  DecryptionFailedError,
  ERC20ReadFailedError,
  EncryptionFailedError,
  InsufficientERC20BalanceError,
  SignerNotConfiguredError,
  TransactionRevertedError,
  ZamaError,
} from "../errors";
import { isZeroHandle } from "../utils/handles";
import { toError } from "../utils";
import { requireAlignedWalletAccount, requireChainAlignment } from "../utils/alignment";
import { assertBigint, assertNonNullable } from "../utils/assertions";
import { swallow } from "../utils/swallow";
import { Token } from "./token";
import type {
  GenericSigner,
  FinalizeUnwrapOptions,
  ShieldCallbacks,
  ShieldOptions,
  TransactionResult,
  UnwrapAllOptions,
  UnwrapOptions,
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

  /**
   * Build a clear-signing preview for shielding public ERC-20 tokens into this
   * confidential wrapper without submitting transactions.
   */
  async createShieldClearSigningIntent(
    amount: bigint,
    options?: ShieldOptions,
  ): Promise<ClearSigningIntent> {
    const account = await requireAlignedWalletAccount(
      "createShieldClearSigningIntent",
      this.sdk.signer,
      this.sdk.provider,
    );
    const underlying = await this.#getUnderlying();
    const userAddress = getAddress(account.address);
    const recipient = options?.to ? getAddress(options.to) : userAddress;
    const chainId = await this.sdk.provider.getChainId();
    if (await this.isPayable()) {
      return buildShieldViaTransferAndCallIntent({
        underlyingTokenAddress: underlying,
        wrapperAddress: this.address,
        senderAddress: userAddress,
        recipientAddress: recipient,
        amount,
        chainId,
      });
    }
    const approvalStrategy = options?.approvalStrategy ?? "exact";
    return buildShieldViaWrapIntent({
      underlyingTokenAddress: underlying,
      wrapperAddress: this.address,
      senderAddress: userAddress,
      recipientAddress: recipient,
      amount,
      approvalAmount:
        approvalStrategy === "skip"
          ? undefined
          : approvalStrategy === "max"
            ? 2n ** 256n - 1n
            : amount,
      maxApproval: approvalStrategy === "max",
      chainId,
    });
  }

  /** Build a clear-signing preview for the first phase of a specific-amount unshield. */
  async createUnwrapClearSigningIntent(amount: bigint): Promise<ClearSigningIntent> {
    const account = await requireAlignedWalletAccount(
      "createUnwrapClearSigningIntent",
      this.sdk.signer,
      this.sdk.provider,
    );
    const userAddress = getAddress(account.address);
    return buildUnwrapIntent({
      wrapperAddress: this.address,
      fromAddress: userAddress,
      recipientAddress: userAddress,
      amount,
      chainId: await this.sdk.provider.getChainId(),
    });
  }

  /** Build a clear-signing preview for unshielding the entire confidential balance. */
  async createUnwrapAllClearSigningIntent(): Promise<ClearSigningIntent> {
    const account = await requireAlignedWalletAccount(
      "createUnwrapAllClearSigningIntent",
      this.sdk.signer,
      this.sdk.provider,
    );
    const userAddress = getAddress(account.address);
    const handle = await this.readConfidentialBalanceOf(userAddress);
    if (isZeroHandle(handle)) {
      throw new DecryptionFailedError("Cannot unshield: balance is zero");
    }
    return buildUnwrapAllIntent({
      wrapperAddress: this.address,
      fromAddress: userAddress,
      recipientAddress: userAddress,
      encryptedBalance: { value: handle },
      chainId: await this.sdk.provider.getChainId(),
    });
  }

  /** Build a clear-signing preview for finalizing a pending unshield. */
  async createFinalizeUnwrapClearSigningIntent(
    unwrapRequestIdOrAmount: Handle,
    clearAmount?: bigint,
  ): Promise<ClearSigningIntent> {
    return buildFinalizeUnwrapIntent({
      wrapperAddress: this.address,
      unwrapRequestId: unwrapRequestIdOrAmount,
      clearAmount,
      chainId: await this.sdk.provider.getChainId(),
    });
  }

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
      return this.#shieldViaTransferAndCall(
        amount,
        underlying,
        userAddress,
        account.chainId,
        options,
      );
    }
    return this.#shieldViaApproveAndWrap(amount, userAddress, account.chainId, options);
  }

  async #shieldViaTransferAndCall(
    amount: bigint,
    underlying: Address,
    userAddress: Address,
    chainId: number,
    options?: ShieldOptions,
  ): Promise<TransactionResult> {
    this.#requireSigner("shield");
    const recipient = options?.to ? getAddress(options.to) : userAddress;
    // ERC7984ERC20Wrapper.onTransferReceived decodes the recipient via
    // `address(bytes20(data))` — i.e. the first 20 bytes of `data`. We pass
    // the raw 20-byte address (not ABI-encoded), and the empty payload `0x`
    // for self-shield so the wrapper falls back to `from`.
    const data: Hex = recipient === userAddress ? "0x" : recipient;

    await swallow("shield: onClearSigningIntent", () =>
      options?.onClearSigningIntent?.(
        buildShieldViaTransferAndCallIntent({
          underlyingTokenAddress: underlying,
          wrapperAddress: this.address,
          senderAddress: userAddress,
          recipientAddress: recipient,
          amount,
          chainId,
        }),
      ),
    );

    return this.submitTransaction({
      operation: "shield:transferAndCall",
      config: transferAndCallContract(underlying, this.address, amount, data),
      onSubmitted: options?.onShieldSubmitted,
    });
  }

  async #shieldViaApproveAndWrap(
    amount: bigint,
    userAddress: Address,
    chainId: number,
    options?: ShieldOptions,
  ): Promise<TransactionResult> {
    this.#requireSigner("shield");
    const strategy = options?.approvalStrategy ?? "exact";
    const underlying = await this.#getUnderlying();
    const recipient = options?.to ? getAddress(options.to) : userAddress;
    await swallow("shield: onClearSigningIntent", () =>
      options?.onClearSigningIntent?.(
        buildShieldViaWrapIntent({
          underlyingTokenAddress: underlying,
          wrapperAddress: this.address,
          senderAddress: userAddress,
          recipientAddress: recipient,
          amount,
          approvalAmount:
            strategy === "skip" ? undefined : strategy === "max" ? 2n ** 256n - 1n : amount,
          maxApproval: strategy === "max",
          chainId,
        }),
      ),
    );
    if (strategy !== "skip") {
      await this.#ensureAllowance(amount, strategy === "max", options);
    }
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
      onClearSigningIntent,
      onUnwrapSubmitted,
      onFinalizing,
      onFinalizeSubmitted,
    } = options ?? {};

    if (!skipBalanceCheck) {
      await this.assertConfidentialBalance(amount);
    }

    const callbacks: UnshieldCallbacks = {
      onClearSigningIntent,
      onFinalizing,
      onFinalizeSubmitted,
    };
    const operationId = crypto.randomUUID();
    const unwrapResult = await this.unwrap(amount, { onClearSigningIntent });
    void swallow("unshield: onUnwrapSubmitted", () => onUnwrapSubmitted?.(unwrapResult.txHash));
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
    const unwrapResult = await this.unwrapAll(callbacks);
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
  async unwrap(amount: bigint, options?: UnwrapOptions): Promise<TransactionResult> {
    this.#requireSigner("unwrap");
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
    const encryptedAmountValue = typeof handle === "string" ? handle : toHex(handle);

    await swallow("unwrap: onClearSigningIntent", () =>
      options?.onClearSigningIntent?.(
        buildUnwrapIntent({
          wrapperAddress: this.address,
          fromAddress: userAddress,
          recipientAddress: userAddress,
          amount,
          encryptedAmount: { value: encryptedAmountValue } satisfies ClearSigningEncryptedValue,
          hasInputProof: true,
          chainId: account.chainId,
        }),
      ),
    );

    return this.submitTransaction({
      operation: "unwrap",
      config: unwrapContract(this.address, userAddress, userAddress, handle, inputProof),
    });
  }

  /**
   * Request an unwrap for the entire confidential balance.
   * Uses the on-chain balance handle directly (no encryption needed).
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
  async unwrapAll(options?: UnwrapAllOptions): Promise<TransactionResult> {
    this.#requireSigner("unwrapAll");
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

    await swallow("unwrapAll: onClearSigningIntent", () =>
      options?.onClearSigningIntent?.(
        buildUnwrapAllIntent({
          wrapperAddress: this.address,
          fromAddress: userAddress,
          recipientAddress: userAddress,
          encryptedBalance: { value: handle } satisfies ClearSigningEncryptedValue,
          chainId: account.chainId,
        }),
      ),
    );

    return this.submitTransaction({
      operation: "unwrapAll",
      config: unwrapFromBalanceContract(this.address, userAddress, userAddress, handle),
    });
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
  async finalizeUnwrap(
    unwrapRequestIdOrAmount: Handle,
    options?: FinalizeUnwrapOptions,
  ): Promise<TransactionResult> {
    this.#requireSigner("finalizeUnwrap");
    await requireChainAlignment("finalizeUnwrap", this.sdk.signer, this.sdk.provider);
    const chainId = await this.sdk.provider.getChainId();
    const result = await this.sdk.decryption.publicDecrypt([unwrapRequestIdOrAmount]);
    const clearValue = result.clearValues[unwrapRequestIdOrAmount];
    assertBigint(clearValue, "finalizeUnwrap: clearValue");
    await swallow("finalizeUnwrap: onClearSigningIntent", () =>
      options?.onClearSigningIntent?.(
        buildFinalizeUnwrapIntent({
          wrapperAddress: this.address,
          unwrapRequestId: unwrapRequestIdOrAmount,
          clearAmount: clearValue,
          hasDecryptionProof: true,
          chainId,
        }),
      ),
    );
    return this.submitTransaction({
      operation: "finalizeUnwrap",
      config: finalizeUnwrapContract(
        this.address,
        unwrapRequestIdOrAmount,
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
      {
        onClearSigningIntent: callbacks?.onClearSigningIntent,
      },
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
