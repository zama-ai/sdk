import {
  allowanceContract,
  approveContract,
  confidentialTransferContract,
  confidentialTransferFromContract,
  delegateForUserDecryptionContract,
  finalizeUnwrapContract,
  isOperatorContract,
  revokeDelegationContract,
  setOperatorContract,
  underlyingContract,
  unwrapContract,
  unwrapFromBalanceContract,
  wrapContract,
  wrapETHContract,
} from "../contracts";
import { hexToBigInt } from "viem";
import { findUnwrapRequested } from "../events/onchain-events";
import type { Address, Handle, Hex } from "../relayer/relayer-sdk.types";
import { normalizeAddress } from "../utils";
import {
  ZamaError,
  EncryptionFailedError,
  ApprovalFailedError,
  TransactionRevertedError,
  DecryptionFailedError,
} from "./errors";
import { ReadonlyToken, type ReadonlyTokenConfig } from "./readonly-token";
import { ZamaSDKEvents } from "../events/sdk-events";
import type {
  TransactionResult,
  UnshieldCallbacks,
  ShieldCallbacks,
  TransferCallbacks,
} from "./token.types";

/** Coerce an unknown caught value to an Error instance. */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

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
    this.wrapper = config.wrapper ? normalizeAddress(config.wrapper, "wrapper") : this.address;
  }

  async #getUnderlying(): Promise<Address> {
    if (this.#underlying !== undefined) return this.#underlying;
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
   * @param to - Recipient address.
   * @param amount - Plaintext amount to transfer (encrypted automatically via FHE).
   * @returns The transaction hash and mined receipt.
   * @throws {@link EncryptionFailedError} if FHE encryption fails.
   * @throws {@link TransactionRevertedError} if the on-chain transfer reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.confidentialTransfer("0xRecipient", 1000n);
   * ```
   */
  async confidentialTransfer(
    to: Address,
    amount: bigint,
    callbacks?: TransferCallbacks,
  ): Promise<TransactionResult> {
    const normalizedTo = normalizeAddress(to, "to");

    let handles: Uint8Array[];
    let inputProof: Uint8Array;
    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.EncryptStart });
      ({ handles, inputProof } = await this.sdk.encrypt({
        values: [{ value: amount, type: "euint64" }],
        contractAddress: this.address,
        userAddress: await this.signer.getAddress(),
      }));
      this.emit({ type: ZamaSDKEvents.EncryptEnd, durationMs: Date.now() - t0 });
      safeCallback(() => callbacks?.onEncryptComplete?.());
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.EncryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      if (error instanceof ZamaError) throw error;
      throw new EncryptionFailedError("Failed to encrypt transfer amount", {
        cause: error instanceof Error ? error : undefined,
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
      safeCallback(() => callbacks?.onTransferSubmitted?.(txHash));
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.TransactionError,
        operation: "transfer",
        error: toError(error),
      });
      if (error instanceof ZamaError) throw error;
      throw new TransactionRevertedError("Transfer transaction failed", {
        cause: error instanceof Error ? error : undefined,
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
    const normalizedFrom = normalizeAddress(from, "from");
    const normalizedTo = normalizeAddress(to, "to");

    let handles: Uint8Array[];
    let inputProof: Uint8Array;
    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.EncryptStart });
      ({ handles, inputProof } = await this.sdk.encrypt({
        values: [{ value: amount, type: "euint64" }],
        contractAddress: this.address,
        userAddress: normalizedFrom,
      }));
      this.emit({ type: ZamaSDKEvents.EncryptEnd, durationMs: Date.now() - t0 });
      safeCallback(() => callbacks?.onEncryptComplete?.());
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.EncryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      if (error instanceof ZamaError) throw error;
      throw new EncryptionFailedError("Failed to encrypt transferFrom amount", {
        cause: error instanceof Error ? error : undefined,
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
      if (error instanceof ZamaError) throw error;
      throw new TransactionRevertedError("TransferFrom transaction failed", {
        cause: error instanceof Error ? error : undefined,
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
    const normalizedSpender = normalizeAddress(spender, "spender");
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
      if (error instanceof ZamaError) throw error;
      throw new ApprovalFailedError("Operator approval failed", {
        cause: error instanceof Error ? error : undefined,
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
    const normalizedSpender = normalizeAddress(spender, "spender");
    const resolvedHolder = holder
      ? normalizeAddress(holder, "holder")
      : await this.signer.getAddress();
    return this.signer.readContract(
      isOperatorContract(this.address, resolvedHolder, normalizedSpender),
    );
  }

  /**
   * Shield public ERC-20 tokens into confidential tokens.
   * Handles ERC-20 approval automatically based on `approvalStrategy`
   * (`"exact"` by default, `"max"` for unlimited approval, `"skip"` to opt out).
   *
   * @param amount - The plaintext amount to shield.
   * @param options - Optional configuration: `approvalStrategy` (`"exact"` | `"max"` | `"skip"`, default `"exact"`), `fees` (extra ETH for native wrappers).
   * @returns The transaction hash and mined receipt.
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
  async shield(
    amount: bigint,
    options?: {
      approvalStrategy?: "max" | "exact" | "skip";
      fees?: bigint;
      /** Recipient address for the shielded tokens. Defaults to the connected wallet. */
      to?: Address;
      /** Progress callbacks for the multi-step shield flow. */
      callbacks?: ShieldCallbacks;
    },
  ): Promise<TransactionResult> {
    const underlying = await this.#getUnderlying();

    if (underlying === Token.ZERO_ADDRESS) {
      return this.shieldETH(amount, amount + (options?.fees ?? 0n));
    }

    const strategy = options?.approvalStrategy ?? "exact";
    if (strategy !== "skip") {
      await this.#ensureAllowance(amount, strategy === "max", options?.callbacks);
    }

    try {
      const recipient = options?.to
        ? normalizeAddress(options.to, "to")
        : await this.signer.getAddress();
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
      if (error instanceof ZamaError) throw error;
      throw new TransactionRevertedError("Shield transaction failed", {
        cause: error instanceof Error ? error : undefined,
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
      if (error instanceof ZamaError) throw error;
      throw new TransactionRevertedError("Shield ETH transaction failed", {
        cause: error instanceof Error ? error : undefined,
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
      ({ handles, inputProof } = await this.sdk.encrypt({
        values: [{ value: amount, type: "euint64" }],
        contractAddress: this.wrapper,
        userAddress,
      }));
      this.emit({ type: ZamaSDKEvents.EncryptEnd, durationMs: Date.now() - t0 });
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.EncryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      if (error instanceof ZamaError) throw error;
      throw new EncryptionFailedError("Failed to encrypt unshield amount", {
        cause: error instanceof Error ? error : undefined,
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
      if (error instanceof ZamaError) throw error;
      throw new TransactionRevertedError("Unshield transaction failed", {
        cause: error instanceof Error ? error : undefined,
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
      if (error instanceof ZamaError) throw error;
      throw new TransactionRevertedError("Unshield-all transaction failed", {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  /**
   * Unshield a specific amount and finalize in one call.
   * Orchestrates: unshield → wait for receipt → parse event → finalize.
   *
   * @param amount - The plaintext amount to unshield.
   * @param callbacks - Optional progress callbacks for each phase.
   * @returns The finalize transaction hash and mined receipt.
   * @throws {@link EncryptionFailedError} if FHE encryption fails.
   * @throws {@link TransactionRevertedError} if any transaction in the flow reverts.
   *
   * @example
   * ```ts
   * const txHash = await token.unshield(500n);
   * ```
   */
  async unshield(amount: bigint, callbacks?: UnshieldCallbacks): Promise<TransactionResult> {
    const operationId = crypto.randomUUID();
    const unwrapResult = await this.unwrap(amount);
    safeCallback(() => callbacks?.onUnwrapSubmitted?.(unwrapResult.txHash));
    return this.#waitAndFinalizeUnshield(unwrapResult.txHash, callbacks, operationId);
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
    return this.#waitAndFinalizeUnshield(unwrapResult.txHash, callbacks, operationId);
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
    return this.#waitAndFinalizeUnshield(unwrapTxHash, callbacks, crypto.randomUUID());
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
      const result = await this.sdk.publicDecrypt([burnAmountHandle]);
      this.emit({ type: ZamaSDKEvents.DecryptEnd, durationMs: Date.now() - t0 });
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
      if (error instanceof ZamaError) throw error;
      throw new DecryptionFailedError("Failed to finalize unshield", {
        cause: error instanceof Error ? error : undefined,
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
      if (error instanceof ZamaError) throw error;
      throw new TransactionRevertedError("Failed to finalize unshield", {
        cause: error instanceof Error ? error : undefined,
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
      if (error instanceof ZamaError) throw error;
      throw new ApprovalFailedError("ERC-20 approval failed", {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  // DELEGATION OPERATIONS

  /**
   * @param options.expirationDate - When the delegation expires. Defaults to
   *   `uint64.max` (≈ year 584 billion), i.e. no practical expiry.
   */
  async delegateDecryption(
    delegate: Address,
    options?: { expirationDate?: Date },
  ): Promise<TransactionResult> {
    const acl = this.requireAclAddress();
    const normalizedDelegate = normalizeAddress(delegate, "delegate");
    // uint64 max → no practical expiry
    const expirationDate = options?.expirationDate
      ? BigInt(Math.floor(options.expirationDate.getTime() / 1000))
      : 2n ** 64n - 1n;

    try {
      const txHash = await this.signer.writeContract(
        delegateForUserDecryptionContract(acl, normalizedDelegate, this.address, expirationDate),
      );
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      if (error instanceof ZamaError) throw error;
      throw new TransactionRevertedError("Delegation transaction failed", {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async revokeDelegation(delegate: Address): Promise<TransactionResult> {
    const acl = this.requireAclAddress();
    const normalizedDelegate = normalizeAddress(delegate, "delegate");

    try {
      const txHash = await this.signer.writeContract(
        revokeDelegationContract(acl, normalizedDelegate, this.address),
      );
      const receipt = await this.signer.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      if (error instanceof ZamaError) throw error;
      throw new TransactionRevertedError("Revoke delegation transaction failed", {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  // BATCH DELEGATION

  static async delegateDecryptionBatch(
    tokens: Token[],
    delegate: Address,
    options?: { expirationDate?: Date },
  ): Promise<Map<Address, TransactionResult | ZamaError>> {
    const results = new Map<Address, TransactionResult | ZamaError>();
    const settled = await Promise.allSettled(
      tokens.map((t) => t.delegateDecryption(delegate, options)),
    );
    for (let i = 0; i < tokens.length; i++) {
      const outcome = settled[i]!;
      if (outcome.status === "fulfilled") {
        results.set(tokens[i]!.address, outcome.value);
      } else {
        const err =
          outcome.reason instanceof ZamaError
            ? outcome.reason
            : new TransactionRevertedError("Delegation failed", {
                cause: outcome.reason instanceof Error ? outcome.reason : undefined,
              });
        results.set(tokens[i]!.address, err);
      }
    }
    return results;
  }

  static async revokeDelegationBatch(
    tokens: Token[],
    delegate: Address,
  ): Promise<Map<Address, TransactionResult | ZamaError>> {
    const results = new Map<Address, TransactionResult | ZamaError>();
    const settled = await Promise.allSettled(tokens.map((t) => t.revokeDelegation(delegate)));
    for (let i = 0; i < tokens.length; i++) {
      const outcome = settled[i]!;
      if (outcome.status === "fulfilled") {
        results.set(tokens[i]!.address, outcome.value);
      } else {
        const err =
          outcome.reason instanceof ZamaError
            ? outcome.reason
            : new TransactionRevertedError("Revoke delegation failed", {
                cause: outcome.reason instanceof Error ? outcome.reason : undefined,
              });
        results.set(tokens[i]!.address, err);
      }
    }
    return results;
  }

  // PRIVATE HELPERS

  async #waitAndFinalizeUnshield(
    unshieldHash: Hex,
    callbacks: UnshieldCallbacks | undefined,
    operationId: string,
  ): Promise<TransactionResult> {
    this.emit({ type: ZamaSDKEvents.UnshieldPhase1Submitted, txHash: unshieldHash, operationId });
    let receipt;
    try {
      receipt = await this.signer.waitForTransactionReceipt(unshieldHash);
    } catch (error) {
      if (error instanceof ZamaError) throw error;
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

    if (allowance >= amount) return;

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
      if (error instanceof ZamaError) throw error;
      throw new ApprovalFailedError("ERC-20 approval failed", {
        cause: error instanceof Error ? error : undefined,
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
  } catch {
    // Swallow – the caller must not be disrupted by listener errors.
  }
}
