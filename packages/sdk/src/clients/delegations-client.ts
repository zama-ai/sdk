import type { Address } from "viem";
import type { DelegationService } from "../services/delegation-service";
import type { GenericProvider, GenericSigner, TransactionResult } from "../types";
import { requireAlignedWalletAccount } from "../utils/alignment";
import { SignerNotConfiguredError } from "../errors";
import { assertNonNullable } from "../utils/assertions";

/**
 * Public client for on-chain decryption-delegation management.
 *
 * Exposed as `sdk.delegations`. Owns the SDK-level guards (signer requirement, chain
 * alignment, delegator address resolution from the wallet account) and delegates the
 * actual work to the internal {@link DelegationService}.
 *
 * Delegation operations write to the host chain ACL; after a delegation is mined,
 * allow **1–2 minutes** before attempting delegated decryption to let the gateway
 * sync the ACL state via cross-chain event propagation.
 */
export class DelegationsClient {
  readonly #signer: GenericSigner | undefined;
  readonly #provider: GenericProvider;
  readonly #delegationService: DelegationService;

  /** @internal */
  constructor(opts: {
    signer: GenericSigner | undefined;
    provider: GenericProvider;
    delegationService: DelegationService;
  }) {
    this.#signer = opts.signer;
    this.#provider = opts.provider;
    this.#delegationService = opts.delegationService;
  }

  #requireSigner(operation: string): GenericSigner {
    try {
      assertNonNullable(this.#signer, "DelegationsClient.#signer");
      return this.#signer;
    } catch (cause) {
      throw new SignerNotConfiguredError(operation, { cause });
    }
  }

  /**
   * Delegate decryption rights for a confidential contract to another address.
   * Calls `ACL.delegateForUserDecryption()` on-chain.
   *
   * **Important:** After the transaction is mined, allow **1–2 minutes** before
   * attempting delegated decryption. The delegation is recorded on L1 immediately,
   * but the gateway must sync the ACL state via cross-chain event propagation.
   *
   * @param contractAddress - The confidential contract address to delegate on.
   * @param delegateAddress - Address to delegate decryption rights to.
   * @param expirationDate - Optional expiration date (defaults to permanent delegation via `uint64.max`).
   * @returns The transaction hash and mined receipt.
   * @throws if no signer is configured. {@link SignerNotConfiguredError}
   * @throws if signer and provider are on different chains. {@link ChainMismatchError}
   * @throws if `expirationDate` is less than 1 hour in the future. {@link DelegationExpirationTooSoonError}
   * @throws if the delegate equals the connected wallet. {@link DelegationSelfNotAllowedError}
   * @throws if the delegate equals the contract address. {@link DelegationDelegateEqualsContractError}
   * @throws if the new expiry equals the current one. {@link DelegationExpiryUnchangedError}
   * @throws if the delegation transaction reverts. {@link TransactionRevertedError}
   */
  async delegate({
    contractAddress,
    delegateAddress,
    expirationDate,
  }: {
    contractAddress: Address;
    delegateAddress: Address;
    expirationDate?: Date;
  }): Promise<TransactionResult> {
    const signer = this.#requireSigner("delegate");
    const account = await requireAlignedWalletAccount("delegate", this.#signer, this.#provider);
    return this.#delegationService.delegateDecryption(signer, {
      contractAddress,
      delegateAddress,
      delegatorAddress: account.address,
      expirationDate,
    });
  }

  /**
   * Revoke decryption delegation for a confidential contract.
   * Calls `ACL.revokeDelegationForUserDecryption()` on-chain.
   *
   * @param contractAddress - The confidential contract address to revoke delegation on.
   * @param delegateAddress - Address to revoke delegation from.
   * @returns The transaction hash and mined receipt.
   * @throws if no signer is configured. {@link SignerNotConfiguredError}
   * @throws if signer and provider are on different chains. {@link ChainMismatchError}
   * @throws if no delegation exists for this (delegator, delegate, contract) tuple. {@link DelegationNotFoundError}
   * @throws if the revocation transaction reverts. {@link TransactionRevertedError}
   */
  async revoke({
    contractAddress,
    delegateAddress,
  }: {
    contractAddress: Address;
    delegateAddress: Address;
  }): Promise<TransactionResult> {
    const signer = this.#requireSigner("revoke");
    const account = await requireAlignedWalletAccount("revoke", this.#signer, this.#provider);
    return this.#delegationService.revokeDelegation(signer, {
      contractAddress,
      delegateAddress,
      delegatorAddress: account.address,
    });
  }

  /**
   * Check whether a delegation is active for the given contract address.
   *
   * Signer-independent: works without a configured signer.
   *
   * @param contractAddress - The confidential contract address.
   * @param delegatorAddress - The address that granted the delegation.
   * @param delegateAddress - The address that received delegation rights.
   * @returns `true` if the delegation exists and has not expired.
   */
  async isActive(params: {
    contractAddress: Address;
    delegatorAddress: Address;
    delegateAddress: Address;
  }): Promise<boolean> {
    return this.#delegationService.isDelegated(params);
  }

  /**
   * Get the expiration timestamp of a delegation for the given contract.
   *
   * Signer-independent: works without a configured signer.
   *
   * @param contractAddress - The confidential contract address.
   * @param delegatorAddress - The address that granted the delegation.
   * @param delegateAddress - The address that received delegation rights.
   * @returns Unix timestamp as bigint. `0n` = no delegation. `2^64 - 1` = permanent.
   */
  async getExpiry(params: {
    contractAddress: Address;
    delegatorAddress: Address;
    delegateAddress: Address;
  }): Promise<bigint> {
    return this.#delegationService.getDelegationExpiry(params);
  }
}
