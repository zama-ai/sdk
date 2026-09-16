import { getAddress, type Address } from "viem";
import { WrappedToken } from "../token";
import type { ZamaSDK } from "../zama-sdk";
import type { JoinResult, VaultAddresses, VaultJoinOptions } from "./types";
import { VaultBatcher } from "./vault-batcher";

/**
 * A confidential ERC-4626 vault: one deposit batcher and one redeem batcher
 * behind ERC-20-style `deposit` and `requestWithdrawal` methods.
 *
 * Claiming, quitting and batch state live on the two batchers directly —
 * `vault.depositBatcher.claim(batchId)`.
 */
export class Vault {
  /** The SDK instance this vault reads and writes through. */
  readonly sdk: ZamaSDK;
  /** Checksummed address of the underlying ERC-4626 vault contract. */
  readonly address: Address;
  /** The batcher deposits of the underlying asset join. */
  readonly depositBatcher: VaultBatcher;
  /** The batcher share redemptions join. */
  readonly redeemBatcher: VaultBatcher;

  // The promise is cached, not just the resolved value, so concurrent callers
  // share one lookup and end up with the same instance.
  #depositToken: Promise<WrappedToken> | null = null;
  #shareToken: Promise<WrappedToken> | null = null;

  constructor(sdk: ZamaSDK, addresses: VaultAddresses) {
    this.sdk = sdk;
    this.address = getAddress(addresses.vault);
    this.depositBatcher = new VaultBatcher(sdk, addresses.depositBatcher);
    this.redeemBatcher = new VaultBatcher(sdk, addresses.redeemBatcher);
  }

  /** The confidential token deposited into this vault. Resolved once and cached. */
  async depositToken(): Promise<WrappedToken> {
    this.#depositToken ??= this.depositBatcher
      .fromToken()
      .then((address) => new WrappedToken(this.sdk, address))
      .catch((error: unknown) => {
        this.#depositToken = null;
        throw error;
      });
    return this.#depositToken;
  }

  /**
   * The confidential share token this vault issues. Resolved once and cached.
   *
   * Read from the redeem batcher, which is the contract that actually pulls
   * these shares and so decides which token a withdrawal must grant on.
   */
  async shareToken(): Promise<WrappedToken> {
    this.#shareToken ??= this.redeemBatcher
      .fromToken()
      .then((address) => new WrappedToken(this.sdk, address))
      .catch((error: unknown) => {
        this.#shareToken = null;
        throw error;
      });
    return this.#shareToken;
  }

  /**
   * Deposit a plaintext amount of the underlying confidential asset,
   * joining the current deposit batch. Grants the deposit batcher an
   * ERC-7984 operator approval on the deposit token first, unless one is
   * already active.
   *
   * @param amount - The plaintext amount to deposit.
   * @param options - Optional `beneficiary` and `operatorDeadline`.
   */
  async deposit(amount: bigint, options?: VaultJoinOptions): Promise<JoinResult> {
    const token = await this.depositToken();
    await this.#ensureOperator(
      "deposit",
      token,
      this.depositBatcher.address,
      options?.operatorDeadline,
    );
    return this.depositBatcher.join(amount, options?.beneficiary);
  }

  /**
   * Request a withdrawal by joining the current redeem batch with a
   * plaintext amount of shares. Grants the redeem batcher an ERC-7984
   * operator approval on the share token first, unless one is already
   * active.
   *
   * @param amount - The plaintext amount of shares to redeem.
   * @param options - Optional `beneficiary` and `operatorDeadline`.
   */
  async requestWithdrawal(amount: bigint, options?: VaultJoinOptions): Promise<JoinResult> {
    const token = await this.shareToken();
    await this.#ensureOperator(
      "requestWithdrawal",
      token,
      this.redeemBatcher.address,
      options?.operatorDeadline,
    );
    return this.redeemBatcher.join(amount, options?.beneficiary);
  }

  /**
   * The batcher pulls with `confidentialTransferFrom`, which ERC-7984 rejects
   * unless the batcher is already an operator of the caller.
   */
  async #ensureOperator(
    operation: string,
    token: WrappedToken,
    operator: Address,
    until: number | undefined,
  ): Promise<void> {
    if (!this.sdk.signer) {
      // Nothing to check `isOperator` against; let the join raise instead, so
      // the error names the operation the caller actually asked for.
      return;
    }
    const account = this.sdk.signer.requireWalletAccount(operation);
    const alreadyApproved = await token.isOperator(account.address, operator);
    if (!alreadyApproved) {
      await token.setOperator(operator, until);
    }
  }
}

/**
 * Create a {@link Vault} bound to `sdk` for the deposit/redeem batchers at `addresses`.
 *
 * @example
 * ```ts
 * import { createVault } from "@zama-fhe/sdk/vaults";
 *
 * const vault = createVault(sdk, {
 *   vault: "0xVault",
 *   depositBatcher: "0xDepositBatcher",
 *   redeemBatcher: "0xRedeemBatcher",
 * });
 * const { batchId } = await vault.deposit(1_000_000n);
 * // …once the batch is dispatched and reaches BatchState.Finalized:
 * await vault.depositBatcher.claim(batchId);
 * ```
 */
export function createVault(sdk: ZamaSDK, addresses: VaultAddresses): Vault {
  return new Vault(sdk, addresses);
}
