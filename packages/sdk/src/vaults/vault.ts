import { getAddress, type Address } from "viem";
import { ConfigurationError } from "../errors";
import { WrappedToken } from "../token";
import type { ZamaSDK } from "../zama-sdk";
import type { JoinResult, VaultAddresses, VaultJoinOptions } from "./types";
import { VaultBatcher } from "./vault-batcher";

/**
 * A confidential ERC-4626 vault: one deposit batcher and one redeem batcher
 * behind ERC-20-style `deposit` and `requestRedeem` methods.
 *
 * Claiming, quitting and batch state live on the two batchers directly —
 * `vault.depositBatcher.claim(batchId)`.
 */
export class Vault {
  /** The SDK instance this vault reads and writes through. */
  readonly sdk: ZamaSDK;
  /** The batcher deposits of the underlying asset join. */
  readonly depositBatcher: VaultBatcher;
  /** The batcher share redemptions join. */
  readonly redeemBatcher: VaultBatcher;

  // The promise is cached, not just the resolved value, so concurrent callers
  // share one lookup and end up with the same instance.
  #vaultAddress: Promise<Address> | null = null;
  #cAsset: Promise<WrappedToken> | null = null;
  #cShare: Promise<WrappedToken> | null = null;

  readonly #expectedVaultAddress: Address | undefined;

  constructor(sdk: ZamaSDK, addresses: VaultAddresses) {
    this.sdk = sdk;
    this.#expectedVaultAddress = addresses.vault ? getAddress(addresses.vault) : undefined;
    this.depositBatcher = new VaultBatcher(sdk, addresses.depositBatcher);
    this.redeemBatcher = new VaultBatcher(sdk, addresses.redeemBatcher);
  }

  /**
   * The underlying ERC-4626 vault contract, read from both batchers rather
   * than trusted from configuration. Resolved once and cached.
   *
   * @throws if the batchers report different vaults, or either disagrees with
   *   an `addresses.vault` passed to the constructor — a mismatched pair would
   *   settle deposits and redemptions against different vaults.
   *   {@link ConfigurationError}
   */
  async vaultAddress(): Promise<Address> {
    this.#vaultAddress ??= this.#resolveVaultAddress().catch((error: unknown) => {
      this.#vaultAddress = null;
      throw error;
    });
    return this.#vaultAddress;
  }

  /**
   * The confidential wrapper of the vault's underlying asset — the token
   * deposits are paid in. Resolved once and cached.
   */
  async cAsset(): Promise<WrappedToken> {
    this.#cAsset ??= this.depositBatcher
      .fromToken()
      .then((address) => new WrappedToken(this.sdk, address))
      .catch((error: unknown) => {
        this.#cAsset = null;
        throw error;
      });
    return this.#cAsset;
  }

  /**
   * The confidential share token this vault issues. Resolved once and cached.
   *
   * Read from the redeem batcher, which is the contract that actually pulls
   * these shares and so decides which token a redemption must grant on.
   */
  async cShare(): Promise<WrappedToken> {
    this.#cShare ??= this.redeemBatcher
      .fromToken()
      .then((address) => new WrappedToken(this.sdk, address))
      .catch((error: unknown) => {
        this.#cShare = null;
        throw error;
      });
    return this.#cShare;
  }

  /**
   * Deposit a plaintext amount of the underlying confidential asset,
   * joining the current deposit batch. Grants the deposit batcher an
   * ERC-7984 operator approval on the deposit token first, unless one is
   * already active.
   *
   * @param amount - The plaintext amount to deposit.
   */
  async deposit(amount: bigint, options?: VaultJoinOptions): Promise<JoinResult> {
    const token = await this.cAsset();
    await this.#ensureOperator(
      "deposit",
      token,
      this.depositBatcher.address,
      options?.operatorUntil,
    );
    return this.depositBatcher.join(amount, options?.beneficiary, {
      skipBalanceCheck: options?.skipBalanceCheck,
    });
  }

  /**
   * Join the current redeem batch, which the vault later settles into the
   * underlying asset at the batch's exchange rate. Grants the redeem batcher
   * an ERC-7984 operator approval on the share token first, unless one is
   * already active.
   *
   * @param amount - The plaintext amount of shares — ERC-4626 `redeem`, not
   *   `withdraw`, so this is denominated in shares, never in assets.
   */
  async requestRedeem(amount: bigint, options?: VaultJoinOptions): Promise<JoinResult> {
    const token = await this.cShare();
    await this.#ensureOperator(
      "requestRedeem",
      token,
      this.redeemBatcher.address,
      options?.operatorUntil,
    );
    return this.redeemBatcher.join(amount, options?.beneficiary, {
      skipBalanceCheck: options?.skipBalanceCheck,
    });
  }

  async #resolveVaultAddress(): Promise<Address> {
    const [depositVault, redeemVault] = await Promise.all([
      this.depositBatcher.vault(),
      this.redeemBatcher.vault(),
    ]);
    if (getAddress(depositVault) !== getAddress(redeemVault)) {
      throw new ConfigurationError(
        `Vault batchers point at different ERC-4626 vaults: deposit batcher ${this.depositBatcher.address} reports ${depositVault}, redeem batcher ${this.redeemBatcher.address} reports ${redeemVault}`,
      );
    }
    const onChain = getAddress(depositVault);
    if (this.#expectedVaultAddress !== undefined && this.#expectedVaultAddress !== onChain) {
      throw new ConfigurationError(
        `Configured vault address ${this.#expectedVaultAddress} does not match the ${onChain} both batchers report`,
      );
    }
    return onChain;
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
