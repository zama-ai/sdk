import { getAddress, type Address } from "viem";
import { ConfigurationError } from "../errors";
import { WrappedToken } from "../token";
import { requireWriteChain } from "../utils/alignment";
import type { ZamaSDK } from "../zama-sdk";
import type { JoinResult, VaultAddresses, VaultJoinOptions } from "./types";
import { VaultBatcher, type VaultBatcherOptions } from "./vault-batcher";

/**
 * A confidential ERC-4626 vault: one deposit batcher and one redeem batcher
 * behind ERC-4626-style `deposit` and `redeem` methods.
 *
 * Claiming, quitting and batch state live on the two batchers directly —
 * `vault.depositBatcher.claim(batchId)`.
 */
export class Vault {
  /** The SDK instance this vault reads and writes through. */
  readonly sdk: ZamaSDK;
  /** Joined by deposits of the underlying asset. */
  readonly depositBatcher: VaultBatcher;
  /** Joined by share redemptions. */
  readonly redeemBatcher: VaultBatcher;
  /** The chain both batchers are on; `undefined` for the provider's current chain. */
  readonly chainId: number | undefined;

  // The promise is cached, not just the resolved value, so concurrent callers
  // share one lookup and end up with the same instance.
  #vaultAddress: Promise<Address> | null = null;
  #cAsset: Promise<WrappedToken> | null = null;
  #cShare: Promise<WrappedToken> | null = null;

  readonly #expectedVaultAddress: Address | undefined;

  constructor(sdk: ZamaSDK, addresses: VaultAddresses, options?: VaultBatcherOptions) {
    this.sdk = sdk;
    this.chainId = options?.chainId;
    this.#expectedVaultAddress = addresses.vault ? getAddress(addresses.vault) : undefined;
    this.depositBatcher = new VaultBatcher(sdk, addresses.depositBatcher, options);
    this.redeemBatcher = new VaultBatcher(sdk, addresses.redeemBatcher, options);
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
   * joining the current deposit batch. The amount is sent to the batcher, so
   * no operator grant is needed, except for another `beneficiary`: then the
   * batcher pulls it and is granted an ERC-7984 operator approval on the
   * deposit token first, unless one is already active.
   *
   * @param amount - The plaintext amount to deposit.
   * @throws before any approval is granted, if the batchers do not agree on
   *   the vault. {@link ConfigurationError}
   */
  async deposit(amount: bigint, options?: VaultJoinOptions): Promise<JoinResult> {
    const [, token] = await Promise.all([this.vaultAddress(), this.cAsset()]);
    await this.#ensureOperator("deposit", token, this.depositBatcher.address, options);
    return this.depositBatcher.join(amount, options?.beneficiary, {
      skipBalanceCheck: options?.skipBalanceCheck,
      onJoinSubmitted: options?.onJoinSubmitted,
      operation: "vault-deposit",
    });
  }

  /**
   * Join the current redeem batch, which the vault later settles into the
   * underlying asset at the batch's exchange rate. The shares are sent to the
   * batcher, so no operator grant is needed, except for another
   * `beneficiary`: then the batcher pulls them and is granted an ERC-7984
   * operator approval on the share token first, unless one is already active.
   *
   * @param amount - The plaintext amount of shares — ERC-4626 `redeem`, not
   *   `withdraw`, so this is denominated in shares, never in assets.
   * @throws before any approval is granted, if the batchers do not agree on
   *   the vault. {@link ConfigurationError}
   */
  async redeem(amount: bigint, options?: VaultJoinOptions): Promise<JoinResult> {
    const [, token] = await Promise.all([this.vaultAddress(), this.cShare()]);
    await this.#ensureOperator("redeem", token, this.redeemBatcher.address, options);
    return this.redeemBatcher.join(amount, options?.beneficiary, {
      skipBalanceCheck: options?.skipBalanceCheck,
      onJoinSubmitted: options?.onJoinSubmitted,
      operation: "vault-redeem",
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
   * A join for another beneficiary pulls with `confidentialTransferFrom`, which
   * ERC-7984 rejects unless the batcher is already an operator of the caller.
   * A join for the caller sends the amount instead and needs no grant.
   */
  async #ensureOperator(
    operation: string,
    token: WrappedToken,
    operator: Address,
    options: VaultJoinOptions | undefined,
  ): Promise<void> {
    // Checked before the grant below, which is sent before the join checks the chain.
    const { address } = await requireWriteChain(
      operation,
      this.sdk.signer,
      this.sdk.provider,
      this.chainId,
    );
    const account = getAddress(address);
    if (options?.beneficiary === undefined || getAddress(options.beneficiary) === account) {
      return;
    }
    const alreadyApproved = await token.isOperator(account, operator);
    if (!alreadyApproved) {
      await token.setOperator(operator, options.operatorUntil);
    }
  }
}

/**
 * Create a {@link Vault} bound to `sdk` for the deposit/redeem batchers at
 * `addresses`. Pass `chainId` to read both batchers on that chain; a deposit
 * or redemption then throws `ChainMismatchError` while the wallet is on
 * another chain.
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
export function createVault(
  sdk: ZamaSDK,
  addresses: VaultAddresses,
  options?: VaultBatcherOptions,
): Vault {
  return new Vault(sdk, addresses, options);
}
