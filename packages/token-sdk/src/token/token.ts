import {
  allowanceContract,
  approveContract,
  confidentialTransferContract,
  confidentialTransferFromContract,
  finalizeUnwrapContract,
  isOperatorContract,
  setOperatorContract,
  underlyingContract,
  unwrapContract,
  unwrapFromBalanceContract,
  wrapContract,
  wrapETHContract,
} from "../contracts";
import { findUnwrapRequested } from "../events";
import type { Hex } from "../relayer/relayer-sdk.types";
import { TokenError, TokenErrorCode } from "./token.types";
import { ReadonlyToken, type ReadonlyTokenConfig } from "./readonly-token";

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
  wrapper?: Hex;
}

export class Token extends ReadonlyToken {
  static readonly ZERO_ADDRESS: Hex = "0x0000000000000000000000000000000000000000";

  readonly wrapper: Hex;
  #underlying: Hex | undefined;
  #underlyingPromise: Promise<Hex> | null = null;

  constructor(config: TokenConfig) {
    super(config);
    this.wrapper = config.wrapper ?? config.address;
  }

  async #getUnderlying(): Promise<Hex> {
    if (this.#underlying !== undefined) return this.#underlying;
    if (!this.#underlyingPromise) {
      this.#underlyingPromise = this.signer
        .readContract<Hex>(underlyingContract(this.wrapper))
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
   * @example
   * ```ts
   * const txHash = await token.confidentialTransfer("0xRecipient", 1000n);
   * ```
   */
  async confidentialTransfer(to: Hex, amount: bigint): Promise<Hex> {
    try {
      const { handles, inputProof } = await this.sdk.encrypt({
        values: [amount],
        contractAddress: this.address,
        userAddress: await this.signer.getAddress(),
      });

      if (handles.length === 0) {
        throw new TokenError(TokenErrorCode.EncryptionFailed, "Encryption returned no handles");
      }

      return await this.signer.writeContract(
        confidentialTransferContract(this.address, to, handles[0], inputProof),
      );
    } catch (error) {
      if (error instanceof TokenError) throw error;
      throw new TokenError(TokenErrorCode.EncryptionFailed, "Failed to encrypt transfer amount", {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  /**
   * Operator encrypted transfer on behalf of another address.
   * The caller must be an approved operator for `from`.
   *
   * @example
   * ```ts
   * const txHash = await token.confidentialTransferFrom("0xFrom", "0xTo", 500n);
   * ```
   */
  async confidentialTransferFrom(from: Hex, to: Hex, amount: bigint): Promise<Hex> {
    try {
      const { handles, inputProof } = await this.sdk.encrypt({
        values: [amount],
        contractAddress: this.address,
        userAddress: from,
      });

      if (handles.length === 0) {
        throw new TokenError(TokenErrorCode.EncryptionFailed, "Encryption returned no handles");
      }

      return await this.signer.writeContract(
        confidentialTransferFromContract(this.address, from, to, handles[0], inputProof),
      );
    } catch (error) {
      if (error instanceof TokenError) throw error;
      throw new TokenError(
        TokenErrorCode.EncryptionFailed,
        "Failed to encrypt transferFrom amount",
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  /**
   * Set operator approval for the confidential token.
   * Defaults to 1 hour from now if `until` is not specified.
   *
   * @example
   * ```ts
   * const txHash = await token.approve("0xSpender");
   * ```
   */
  async approve(spender: Hex, until?: number): Promise<Hex> {
    try {
      return await this.signer.writeContract(setOperatorContract(this.address, spender, until));
    } catch (error) {
      if (error instanceof TokenError) throw error;
      throw new TokenError(TokenErrorCode.ApprovalFailed, "Operator approval failed", {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  /**
   * Check if a spender is an approved operator for the connected wallet.
   *
   * @example
   * ```ts
   * if (await token.isApproved("0xSpender")) {
   *   // spender can call transferFrom
   * }
   * ```
   */
  async isApproved(spender: Hex): Promise<boolean> {
    const holder = await this.signer.getAddress();
    return this.signer.readContract<boolean>(isOperatorContract(this.address, holder, spender));
  }

  /**
   * Wrap public ERC-20 tokens into confidential tokens.
   * Handles ERC-20 approval automatically based on `approvalStrategy`
   * (`"exact"` by default, `"max"` for unlimited approval, `"skip"` to opt out).
   *
   * @example
   * ```ts
   * const txHash = await token.wrap(1000n);
   * // or with exact approval:
   * const txHash = await token.wrap(1000n, { approvalStrategy: "exact" });
   * ```
   */
  async wrap(
    amount: bigint,
    options?: {
      approvalStrategy?: "max" | "exact" | "skip";
      fees?: bigint;
    },
  ): Promise<Hex> {
    const underlying = await this.#getUnderlying();

    if (underlying === Token.ZERO_ADDRESS) {
      return this.wrapETH(amount, amount + (options?.fees ?? 0n));
    }

    const strategy = options?.approvalStrategy ?? "exact";
    if (strategy !== "skip") {
      await this.#ensureAllowance(amount, strategy === "max");
    }

    try {
      const address = await this.signer.getAddress();
      return await this.signer.writeContract(wrapContract(this.wrapper, address, amount));
    } catch (error) {
      if (error instanceof TokenError) throw error;
      throw new TokenError(TokenErrorCode.TransactionReverted, "Shield (wrap) transaction failed", {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  /**
   * Wrap native ETH into confidential tokens. `value` defaults to `amount`.
   *
   * @example
   * ```ts
   * const txHash = await token.wrapETH(1000000000000000000n); // 1 ETH
   * ```
   */
  async wrapETH(amount: bigint, value?: bigint): Promise<Hex> {
    try {
      const userAddress = await this.signer.getAddress();
      return await this.signer.writeContract(
        wrapETHContract(this.wrapper, userAddress, amount, value ?? amount),
      );
    } catch (error) {
      if (error instanceof TokenError) throw error;
      throw new TokenError(
        TokenErrorCode.TransactionReverted,
        "Shield ETH (wrapETH) transaction failed",
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  /**
   * Request an unwrap for a specific amount. Encrypts the amount first.
   * Call {@link finalizeUnwrap} after the request is processed on-chain.
   *
   * @example
   * ```ts
   * const txHash = await token.unwrap(500n);
   * ```
   */
  async unwrap(amount: bigint): Promise<Hex> {
    const userAddress = await this.signer.getAddress();

    let handles: Uint8Array[];
    let inputProof: Uint8Array;
    try {
      ({ handles, inputProof } = await this.sdk.encrypt({
        values: [amount],
        contractAddress: this.wrapper,
        userAddress,
      }));
    } catch (error) {
      if (error instanceof TokenError) throw error;
      throw new TokenError(TokenErrorCode.EncryptionFailed, "Failed to encrypt unshield amount", {
        cause: error instanceof Error ? error : undefined,
      });
    }

    if (handles.length === 0) {
      throw new TokenError(TokenErrorCode.EncryptionFailed, "Encryption returned no handles");
    }

    try {
      return await this.signer.writeContract(
        unwrapContract(this.address, userAddress, userAddress, handles[0], inputProof),
      );
    } catch (error) {
      if (error instanceof TokenError) throw error;
      throw new TokenError(TokenErrorCode.TransactionReverted, "Unshield transaction failed", {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  /**
   * Request an unwrap for the entire confidential balance.
   * Uses the on-chain balance handle directly (no encryption needed).
   * Throws if the balance is zero.
   *
   * @example
   * ```ts
   * const txHash = await token.unwrapAll();
   * ```
   */
  async unwrapAll(): Promise<Hex> {
    const userAddress = await this.signer.getAddress();
    const handle = await this.readConfidentialBalanceOf(userAddress);

    if (this.isZeroHandle(handle)) {
      throw new TokenError(TokenErrorCode.DecryptionFailed, "Cannot unshield: balance is zero");
    }

    try {
      return await this.signer.writeContract(
        unwrapFromBalanceContract(this.address, userAddress, userAddress, handle),
      );
    } catch (error) {
      if (error instanceof TokenError) throw error;
      throw new TokenError(TokenErrorCode.TransactionReverted, "Unshield-all transaction failed", {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  /**
   * Unshield a specific amount and finalize in one call.
   * Orchestrates: unshield → wait for receipt → parse event → finalize.
   *
   * @example
   * ```ts
   * const txHash = await token.unshield(500n);
   * ```
   */
  async unshield(amount: bigint): Promise<Hex> {
    const unshieldHash = await this.unwrap(amount);
    return this.#waitAndFinalizeUnshield(unshieldHash);
  }

  /**
   * Unshield the entire balance and finalize in one call.
   * Orchestrates: unshieldAll → wait for receipt → parse event → finalize.
   *
   * @example
   * ```ts
   * const txHash = await token.unshieldAll();
   * ```
   */
  async unshieldAll(): Promise<Hex> {
    const unshieldHash = await this.unwrapAll();
    return this.#waitAndFinalizeUnshield(unshieldHash);
  }

  /**
   * Complete an unwrap by providing the public decryption proof.
   * Call this after an unshield request has been processed on-chain.
   *
   * @example
   * ```ts
   * const event = findUnwrapRequested(receipt.logs);
   * const txHash = await token.finalizeUnwrap(event.encryptedAmount);
   * ```
   */
  async finalizeUnwrap(burnAmountHandle: Hex): Promise<Hex> {
    try {
      const { abiEncodedClearValues, decryptionProof } = await this.sdk.publicDecrypt([
        burnAmountHandle,
      ]);

      let clearValue: bigint;
      try {
        clearValue = BigInt(abiEncodedClearValues);
      } catch {
        throw new TokenError(
          TokenErrorCode.DecryptionFailed,
          `Cannot parse decrypted value: ${abiEncodedClearValues}`,
        );
      }

      return await this.signer.writeContract(
        finalizeUnwrapContract(this.wrapper, burnAmountHandle, clearValue, decryptionProof),
      );
    } catch (error) {
      if (error instanceof TokenError) throw error;
      throw new TokenError(TokenErrorCode.DecryptionFailed, "Failed to finalize unshield", {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  /**
   * Approve this token contract to spend the underlying ERC-20.
   * Defaults to max uint256. Resets to zero first if there's an existing
   * non-zero allowance (required by tokens like USDT).
   *
   * @example
   * ```ts
   * await token.approveUnderlying(); // max approval
   * await token.approveUnderlying(1000n); // exact amount
   * ```
   */
  async approveUnderlying(amount?: bigint): Promise<Hex> {
    const underlying = await this.#getUnderlying();

    const approvalAmount = amount ?? 2n ** 256n - 1n;

    try {
      if (approvalAmount > 0n) {
        const userAddress = await this.signer.getAddress();
        const currentAllowance = await this.signer.readContract<bigint>(
          allowanceContract(underlying, userAddress, this.wrapper),
        );

        if (currentAllowance > 0n) {
          await this.signer.writeContract(approveContract(underlying, this.wrapper, 0n));
        }
      }

      return await this.signer.writeContract(
        approveContract(underlying, this.wrapper, approvalAmount),
      );
    } catch (error) {
      if (error instanceof TokenError) throw error;
      throw new TokenError(TokenErrorCode.ApprovalFailed, "ERC-20 approval failed", {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  // PRIVATE HELPERS

  async #waitAndFinalizeUnshield(unshieldHash: Hex): Promise<Hex> {
    const receipt = await this.signer.waitForTransactionReceipt(unshieldHash);
    const event = findUnwrapRequested(receipt.logs);
    if (!event) {
      throw new TokenError(
        TokenErrorCode.TransactionReverted,
        "No UnwrapRequested event found in unshield receipt",
      );
    }
    return this.finalizeUnwrap(event.encryptedAmount);
  }

  async #ensureAllowance(amount: bigint, maxApproval: boolean): Promise<void> {
    const underlying = await this.#getUnderlying();

    const userAddress = await this.signer.getAddress();
    const allowance = await this.signer.readContract<bigint>(
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

      await this.signer.writeContract(approveContract(underlying, this.wrapper, approvalAmount));
    } catch (error) {
      if (error instanceof TokenError) throw error;
      throw new TokenError(TokenErrorCode.ApprovalFailed, "ERC-20 approval failed", {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }
}
