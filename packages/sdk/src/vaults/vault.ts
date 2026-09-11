import { getAddress, type Address } from "viem";
import { WrappedToken } from "../token";
import type { TransactionResult } from "../types";
import type { ZamaSDK } from "../zama-sdk";
import type { VaultAddresses, VaultJoinOptions } from "./types";
import { VaultBatcher } from "./vault-batcher";

/**
 * A confidential ERC-4626 vault: the deposit and redeem batchers that make up
 * one vault, wrapped in ERC-20-style methods.
 *
 * `deposit`/`requestWithdrawal` compose `depositBatcher`/`redeemBatcher`
 * (public {@link VaultBatcher} instances) the way `WrappedToken.shield`
 * composes the underlying ERC-20 and ERC-1363 routing, automating a step
 * callers would otherwise have to hand-roll: granting the batcher an
 * ERC-7984 operator approval before it can pull the joined amount — the
 * same pull-based approval model ERC-20's `approve` + `transferFrom` uses.
 *
 * Everything else (claim, quit, recover, batch state, …) is exposed directly
 * on `depositBatcher`/`redeemBatcher` rather than duplicated here — e.g.
 * `vault.depositBatcher.claim(batchId)`.
 *
 * @remarks
 * The operator-grant requirement is inferred from how ERC-7984 batchers pull
 * funds, not yet confirmed against `join`'s exact on-chain behavior for a
 * standalone (non-router) batcher. If a batcher turns out not to need it,
 * granting an unused operator approval is a harmless no-op, not a
 * correctness bug — so this errs on the safe side pending confirmation.
 */
export class Vault {
  readonly sdk: ZamaSDK;
  /** Checksummed address of the underlying ERC-4626 vault contract. */
  readonly address: Address;
  readonly depositBatcher: VaultBatcher;
  readonly redeemBatcher: VaultBatcher;

  // Caches the in-flight promise, not just the resolved value: two concurrent
  // callers (e.g. deposit() and a hook's onSuccess) must share one lookup and
  // end up with the same WrappedToken instance, not race to build two.
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

  /** The confidential share token this vault issues. Resolved once and cached. */
  async shareToken(): Promise<WrappedToken> {
    this.#shareToken ??= this.depositBatcher
      .toToken()
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
  async deposit(amount: bigint, options?: VaultJoinOptions): Promise<TransactionResult> {
    const token = await this.depositToken();
    await this.#ensureOperator(token, this.depositBatcher.address, options?.operatorDeadline);
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
  async requestWithdrawal(amount: bigint, options?: VaultJoinOptions): Promise<TransactionResult> {
    const token = await this.shareToken();
    await this.#ensureOperator(token, this.redeemBatcher.address, options?.operatorDeadline);
    return this.redeemBatcher.join(amount, options?.beneficiary);
  }

  async #ensureOperator(
    token: WrappedToken,
    operator: Address,
    until: number | undefined,
  ): Promise<void> {
    if (!this.sdk.signer) {
      // No signer to check `isOperator` against — let the join call raise
      // SignerNotConfiguredError with an accurate operation name instead.
      return;
    }
    const account = this.sdk.signer.requireWalletAccount("deposit/requestWithdrawal");
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
 * await vault.deposit(1_000_000n);
 * const batchId = await vault.depositBatcher.currentBatchId();
 * await vault.depositBatcher.claim(batchId);
 * ```
 */
export function createVault(sdk: ZamaSDK, addresses: VaultAddresses): Vault {
  return new Vault(sdk, addresses);
}
