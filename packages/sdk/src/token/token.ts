import { type Address, getAddress, type Hex, hexToBigInt } from "viem";
import {
  allowanceContract,
  approveContract,
  balanceOfContract,
  confidentialTransferContract,
  confidentialTransferFromContract,
  delegateForUserDecryptionContract,
  finalizeUnwrapContract,
  isOperatorContract,
  MAX_UINT64,
  revokeDelegationContract,
  setOperatorContract,
  underlyingContract,
  unwrapContract,
  unwrapFromBalanceContract,
  wrapContract,
  wrapETHContract,
} from "../contracts";
import { findUnwrapRequested } from "../events/onchain-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { Handle } from "../relayer/relayer-sdk.types";
import { toError } from "../utils";
import {
  ApprovalFailedError,
  BalanceCheckUnavailableError,
  ConfigurationError,
  DecryptionFailedError,
  EncryptionFailedError,
  InsufficientConfidentialBalanceError,
  InsufficientERC20BalanceError,
  TransactionRevertedError,
  ZamaError,
} from "../errors";
import { ReadonlyToken, type ReadonlyTokenConfig } from "./readonly-token";
import type {
  ShieldCallbacks,
  ShieldOptions,
  TransactionResult,
  TransferCallbacks,
  TransferOptions,
  UnshieldCallbacks,
  UnshieldOptions,
} from "../types";

/**
 * ERC-20-like interface for a single confidential token.
 * Hides all FHE complexity (encryption, decryption, EIP-712 signing)
 * behind familiar methods.
 *
 * Extends ReadonlyToken with write operations
 * (transfer, shield, unshield).
 */
export interface TokenConfig extends ReadonlyTokenConfig {
  /** Override the wrapper address. Defaults to `address` (the token IS the wrapper). */
  wrapper?: Address;
}

export class Token extends ReadonlyToken {
  static readonly ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

  readonly wrapper: Address;
  #underlying: Address | undefined;
  #underlyingPromise: Promise<Address> | null = null;

  constructor(config: TokenConfig) {
    super(config);
    this.wrapper = config.wrapper ? getAddress(config.wrapper) : this.address;
  }

  async #getUnderlying(): Promise<Address> {
    if (this.#underlying !== undefined) {
      return this.#underlying;
    }
    if (!this.#underlyingPromise) {
      this.#underlyingPromise = this.signer
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

  // WRITE OPERATIONS

  /**
   * Confidential transfer. Encrypts the amount via FHE, then calls the contract.
   * Returns the transaction hash.
   *
   * By default, the SDK validates the confidential balance before submitting.
   * If the balance is not yet decrypted and credentials are cached, it auto-decrypts.
   * Set `skipBalanceCheck: true` to bypass this validation (e.g. for smart wallets).
   *
   * @param to - Recipient address.
   * @param amount - Plaintext amount to transfer (encrypted automatically via FHE).
   * @param options - Optional: `skipBalanceCheck` (default `false`).
   * @returns The transaction hash and mined receipt.
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
    const { skipBalanceCheck = false, onEncryptComplete, onTransferSubmitted } = options ?? {};

    const normalizedTo = getAddress(to);

    if (!skipBalanceCheck) {
      await this.#assertConfidentialBalance(amount);
    }

    let handles: Uint8Array[];
    let inputProof: Uint8Array;
    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.EncryptStart });
      ({ handles, inputProof } = await this.relayer.encrypt({
        values: [{ value: amount, type: "euint64" }],
        contractAddress: this.address,
        userAddress: await this.signer.getAddress(),
      }));
      this.emit({
        type: ZamaSDKEvents.EncryptEnd,
        durationMs: Date.now() - t0,
      });
      safeCallback(() => onEncryptComplete?.());
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.EncryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new EncryptionFailedError("Failed to encrypt transfer amount", {
        cause: error,
      });
    }

    if (handles.length === 0) {
      throw new EncryptionFailedError("Encryption returned no handles");
    }

    try {
      const txHash = await this.signer.writeContract(
        confidentialTransferContract(this.address, normalizedTo, handles[0]!, inputProof),
      );
      this.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash });
      safeCallback(() => onTransferSubmitted?.(txHash));
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
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
    const normalizedFrom = getAddress(from);
    const normalizedTo = getAddress(to);

    let handles: Uint8Array[];
    let inputProof: Uint8Array;
    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.EncryptStart });
      ({ handles, inputProof } = await this.relayer.encrypt({
        values: [{ value: amount, type: "euint64" }],
        contractAddress: this.address,
        userAddress: normalizedFrom,
      }));
      this.emit({
        type: ZamaSDKEvents.EncryptEnd,
        durationMs: Date.now() - t0,
      });
      safeCallback(() => callbacks?.onEncryptComplete?.());
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.EncryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new EncryptionFailedError("Failed to encrypt transferFrom amount", {
        cause: error,
      });
    }

    if (handles.length === 0) {
      throw new EncryptionFailedError("Encryption returned no handles");
    }

    try {
      const txHash = await this.signer.writeContract(
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
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
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
   * @param spender - The address to approve as an operator.
   * @param until - Optional Unix timestamp for approval expiry. Defaults to now + 1 hour.
   * @returns The transaction hash and mined receipt.
   * @throws {@link ApprovalFailedError} if the approval transaction fails.
   *
   * @example
   * ```ts
   * const txHash = await token.approve("0xSpender");
   * ```
   */
  async approve(spender: Address, until?: number): Promise<TransactionResult> {
    const normalizedSpender = getAddress(spender);
    try {
      const txHash = await this.signer.writeContract(
        setOperatorContract(this.address, normalizedSpender, until),
      );
      this.emit({ type: ZamaSDKEvents.ApproveSubmitted, txHash });
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "approve",
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
   * @param spender - The address to check operator approval for.
   * @param holder - The token holder address. Defaults to the connected wallet.
   * @returns `true` if the spender is an approved operator for the holder.
   *
   * @example
   * ```ts
   * if (await token.isApproved("0xSpender")) {
   *   // spender can call transferFrom on behalf of connected wallet
   * }
   * // or check for a specific holder:
   * if (await token.isApproved("0xSpender", "0xHolder")) { ... }
   * ```
   */
  async isApproved(spender: Address, holder?: Address): Promise<boolean> {
    const normalizedSpender = getAddress(spender);
    const resolvedHolder = holder ? getAddress(holder) : await this.signer.getAddress();
    return this.signer.readContract(
      isOperatorContract(this.address, resolvedHolder, normalizedSpender),
    );
  }

  /**
   * Shield public ERC-20 tokens into confidential tokens.
   * Handles ERC-20 approval automatically based on `approvalStrategy`
   * (`"exact"` by default, `"max"` for unlimited approval, `"skip"` to opt out).
   *
   * The ERC-20 balance is always validated before submitting since it is a
   * public read with no signing requirement.
   *
   * @param amount - The plaintext amount to shield.
   * @param options - Optional configuration: `approvalStrategy` (`"exact"` | `"max"` | `"skip"`, default `"exact"`), `fees` (extra ETH for native wrappers).
   * @returns The transaction hash and mined receipt.
   * @throws {@link InsufficientERC20BalanceError} if the ERC-20 balance is less than `amount`.
   * @throws {@link ApprovalFailedError} if the ERC-20 approval step fails.
   * @throws {@link TransactionRevertedError} if the shield transaction reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.shield(1000n);
   * // or with exact approval:
   * const txHash = await token.shield(1000n, { approvalStrategy: "exact" });
   * ```
   */
  async shield(amount: bigint, options?: ShieldOptions): Promise<TransactionResult> {
    const underlying = await this.#getUnderlying();

    if (underlying === Token.ZERO_ADDRESS) {
      return this.shieldETH(amount, amount + (options?.fees ?? 0n));
    }

    // ERC-20 balance check always runs (public read, no signing needed, works for all wallet types)
    const userAddress = await this.signer.getAddress();
    const erc20Balance = await this.signer.readContract(balanceOfContract(underlying, userAddress));
    if (erc20Balance < amount) {
      throw new InsufficientERC20BalanceError(
        `Insufficient ERC-20 balance: requested ${amount}, available ${erc20Balance} (token: ${underlying})`,
        { requested: amount, available: erc20Balance, token: underlying },
      );
    }

    const strategy = options?.approvalStrategy ?? "exact";
    if (strategy !== "skip") {
      await this.#ensureAllowance(amount, strategy === "max", options?.callbacks);
    }

    try {
      const recipient = options?.to ? getAddress(options.to) : await this.signer.getAddress();
      const txHash = await this.signer.writeContract(wrapContract(this.wrapper, recipient, amount));
      this.emit({ type: ZamaSDKEvents.ShieldSubmitted, txHash });
      safeCallback(() => options?.callbacks?.onShieldSubmitted?.(txHash));
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "shield",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("Shield transaction failed", {
        cause: error,
      });
    }
  }

  /**
   * Shield native ETH into confidential tokens. `value` defaults to `amount`.
   *
   * @param amount - The amount of ETH to shield (in wei).
   * @param value - Optional ETH value to send. Defaults to `amount`.
   * @returns The transaction hash and mined receipt.
   * @throws {@link TransactionRevertedError} if the shield transaction reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.shieldETH(1000000000000000000n); // 1 ETH
   * ```
   */
  async shieldETH(amount: bigint, value?: bigint): Promise<TransactionResult> {
    try {
      const userAddress = await this.signer.getAddress();
      const txHash = await this.signer.writeContract(
        wrapETHContract(this.wrapper, userAddress, amount, value ?? amount),
      );
      this.emit({ type: ZamaSDKEvents.ShieldSubmitted, txHash });
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "shieldETH",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("Shield ETH transaction failed", {
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
   * @throws {@link EncryptionFailedError} if FHE encryption fails.
   * @throws {@link TransactionRevertedError} if the unwrap transaction reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.unwrap(500n);
   * ```
   */
  async unwrap(amount: bigint): Promise<TransactionResult> {
    const userAddress = await this.signer.getAddress();

    let handles: Uint8Array[];
    let inputProof: Uint8Array;
    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.EncryptStart });
      ({ handles, inputProof } = await this.relayer.encrypt({
        values: [{ value: amount, type: "euint64" }],
        contractAddress: this.wrapper,
        userAddress,
      }));
      this.emit({
        type: ZamaSDKEvents.EncryptEnd,
        durationMs: Date.now() - t0,
      });
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.EncryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new EncryptionFailedError("Failed to encrypt unshield amount", {
        cause: error,
      });
    }

    if (handles.length === 0) {
      throw new EncryptionFailedError("Encryption returned no handles");
    }

    try {
      const txHash = await this.signer.writeContract(
        unwrapContract(this.address, userAddress, userAddress, handles[0]!, inputProof),
      );
      this.emit({ type: ZamaSDKEvents.UnwrapSubmitted, txHash });
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
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
   * @throws {@link DecryptionFailedError} if the balance is zero.
   * @throws {@link TransactionRevertedError} if the unwrap transaction reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.unwrapAll();
   * ```
   */
  async unwrapAll(): Promise<TransactionResult> {
    const userAddress = await this.signer.getAddress();
    const handle = await this.readConfidentialBalanceOf(userAddress);

    if (this.isZeroHandle(handle)) {
      throw new DecryptionFailedError("Cannot unshield: balance is zero");
    }

    try {
      const txHash = await this.signer.writeContract(
        unwrapFromBalanceContract(this.address, userAddress, userAddress, handle),
      );
      this.emit({ type: ZamaSDKEvents.UnwrapSubmitted, txHash });
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
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
   * @param burnAmountHandle - The encrypted amount handle from the `UnwrapRequested` event.
   * @returns The transaction hash and mined receipt.
   * @throws {@link DecryptionFailedError} if public decryption fails.
   * @throws {@link TransactionRevertedError} if the finalize transaction reverts.
   *
   * @example
   * ```ts
   * const event = findUnwrapRequested(receipt.logs);
   * const txHash = await token.finalizeUnwrap(event.encryptedAmount);
   * ```
   */
  async finalizeUnwrap(burnAmountHandle: Handle): Promise<TransactionResult> {
    let clearValue: bigint;
    let decryptionProof: Hex;

    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.DecryptStart });
      const result = await this.relayer.publicDecrypt([burnAmountHandle]);
      this.emit({
        type: ZamaSDKEvents.DecryptEnd,
        durationMs: Date.now() - t0,
      });
      decryptionProof = result.decryptionProof;
      try {
        clearValue = hexToBigInt(result.abiEncodedClearValues);
      } catch {
        throw new DecryptionFailedError(
          `Cannot parse decrypted value: ${result.abiEncodedClearValues}`,
        );
      }
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.DecryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new DecryptionFailedError("Failed to finalize unshield", {
        cause: error,
      });
    }

    try {
      const txHash = await this.signer.writeContract(
        finalizeUnwrapContract(this.wrapper, burnAmountHandle, clearValue, decryptionProof),
      );
      this.emit({ type: ZamaSDKEvents.FinalizeUnwrapSubmitted, txHash });
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
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
   * @throws {@link ApprovalFailedError} if the approval transaction fails.
   *
   * @example
   * ```ts
   * await token.approveUnderlying(); // max approval
   * await token.approveUnderlying(1000n); // exact amount
   * ```
   */
  async approveUnderlying(amount?: bigint): Promise<TransactionResult> {
    const underlying = await this.#getUnderlying();

    const approvalAmount = amount ?? 2n ** 256n - 1n;

    try {
      if (approvalAmount > 0n) {
        const userAddress = await this.signer.getAddress();
        const currentAllowance = await this.signer.readContract(
          allowanceContract(underlying, userAddress, this.wrapper),
        );

        if (currentAllowance > 0n) {
          await this.signer.writeContract(approveContract(underlying, this.wrapper, 0n));
        }
      }

      const txHash = await this.signer.writeContract(
        approveContract(underlying, this.wrapper, approvalAmount),
      );
      this.emit({ type: ZamaSDKEvents.ApproveUnderlyingSubmitted, txHash });
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
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
   * @param delegateAddress - Address to delegate decryption rights to.
   * @param expirationDate - Optional expiration date (defaults to permanent delegation via `uint64.max`).
   * @returns The transaction hash and mined receipt.
   * @throws {@link TransactionRevertedError} if the delegation transaction reverts.
   */
  async delegateDecryption({
    delegateAddress,
    expirationDate,
  }: {
    delegateAddress: Address;
    expirationDate?: Date;
  }): Promise<TransactionResult> {
    if (expirationDate && expirationDate.getTime() <= Date.now()) {
      throw new ConfigurationError("Expiration date must be in the future");
    }

    const acl = await this.getAclAddress();
    // uint64 max → no practical expiry
    const expDate = expirationDate
      ? BigInt(Math.floor(expirationDate.getTime() / 1000))
      : MAX_UINT64;

    try {
      const txHash = await this.signer.writeContract(
        delegateForUserDecryptionContract(acl, getAddress(delegateAddress), this.address, expDate),
      );
      this.emit({ type: ZamaSDKEvents.DelegationSubmitted, txHash });
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "delegateDecryption",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("Delegation transaction failed", {
        cause: error,
      });
    }
  }

  /**
   * Revoke decryption delegation for this token.
   * Calls `ACL.revokeDelegationForUserDecryption()` on-chain.
   *
   * @param delegateAddress - Address to revoke delegation from.
   * @returns The transaction hash and mined receipt.
   * @throws {@link TransactionRevertedError} if the revocation transaction reverts.
   */
  async revokeDelegation({
    delegateAddress,
  }: {
    delegateAddress: Address;
  }): Promise<TransactionResult> {
    const acl = await this.getAclAddress();

    try {
      const txHash = await this.signer.writeContract(
        revokeDelegationContract(acl, getAddress(delegateAddress), this.address),
      );
      this.emit({ type: ZamaSDKEvents.RevokeDelegationSubmitted, txHash });
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "revokeDelegation",
        error: toError(error),
      });
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError("Revoke delegation transaction failed", {
        cause: error,
      });
    }
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
    const settled = await Promise.allSettled(tokens.map(op));
    for (let i = 0; i < tokens.length; i++) {
      const outcome = settled[i]!;
      if (outcome.status === "fulfilled") {
        results.set(tokens[i]!.address, outcome.value);
      } else {
        const err =
          outcome.reason instanceof ZamaError
            ? outcome.reason
            : new TransactionRevertedError(errorMessage, {
                cause: outcome.reason,
              });
        results.set(tokens[i]!.address, err);
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
    const userAddress = await this.signer.getAddress();
    const handle = await this.readConfidentialBalanceOf(userAddress);

    if (this.isZeroHandle(handle)) {
      if (amount === 0n) {return;} // 0 >= 0 satisfies the constraint
      throw new InsufficientConfidentialBalanceError(
        `Insufficient confidential balance: requested ${amount}, available 0 (token: ${this.address})`,
        { requested: amount, available: 0n, token: this.address },
      );
    }

    // Only attempt decryption when credentials are already cached.
    // This avoids triggering an unexpected EIP-712 signing popup during
    // a transfer/unshield flow (respects the explicit-action pattern from SDK-42).
    //
    // Note: isAllowed() is a session-level check (wallet-scoped). The subsequent
    // decryptBalance() call internally does credentials.allow(this.address) which
    // is contract-scoped. If the session was created for a different set of
    // contract addresses, resolveCredentials may extend the credential set via
    // #extendContracts — which re-signs with the existing key (no new EIP-712
    // popup) as long as the underlying credential is time-valid.
    const hasCredentials = await this.isAllowed();
    if (!hasCredentials) {
      throw new BalanceCheckUnavailableError(
        `Cannot validate confidential balance: no cached credentials. ` +
          `Call allow() first or use skipBalanceCheck: true for smart wallets (token: ${this.address})`,
      );
    }

    let balance: bigint;
    try {
      balance = await this.decryptBalance(handle, userAddress);
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new BalanceCheckUnavailableError(
        `Balance validation failed: could not decrypt confidential balance (token: ${this.address})`,
        { cause: error instanceof Error ? error : undefined },
      );
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
      receipt = await this.signer.waitForTransactionReceipt(unshieldHash);
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
    const finalizeResult = await this.finalizeUnwrap(event.encryptedAmount);
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
    const underlying = await this.#getUnderlying();

    const userAddress = await this.signer.getAddress();
    const allowance = await this.signer.readContract(
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
        await this.signer.writeContract(approveContract(underlying, this.wrapper, 0n));
      }

      const approvalAmount = maxApproval ? 2n ** 256n - 1n : amount;

      const txHash = await this.signer.writeContract(
        approveContract(underlying, this.wrapper, approvalAmount),
      );
      this.emit({ type: ZamaSDKEvents.ApproveUnderlyingSubmitted, txHash });
      safeCallback(() => callbacks?.onApprovalSubmitted?.(txHash));
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
