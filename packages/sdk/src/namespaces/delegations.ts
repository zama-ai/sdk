import type { Address } from "viem";
import type { DelegationService, DelegationStatus } from "../services/delegation-service";
import type { GenericProvider, GenericSigner, TransactionResult } from "../types";
import { requireAlignedWalletAccount } from "../utils/alignment";
import { requireConfigured } from "../errors";

/**
 * Public namespace for on-chain decryption-delegation management.
 *
 * Exposed as `sdk.delegations`. Owns the SDK-level guards (signer requirement, chain
 * alignment, delegator address resolution from the wallet account) and delegates the
 * actual work to the internal {@link DelegationService}.
 *
 * Delegation operations write to the host chain ACL; after a delegation is mined,
 * the gateway syncs the ACL state via cross-chain event propagation — usually
 * within ~10 blocks (a few seconds). Delegated decryption rides out that window
 * with a bounded internal retry, so callers can decrypt right after granting.
 */
export class Delegations {
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
    return requireConfigured(this.#signer, operation);
  }

  /**
   * Delegate decryption rights for a confidential contract to another address.
   * Calls `ACL.delegateForUserDecryption()` on-chain.
   *
   * The delegation is recorded on L1 immediately, but the gateway must sync the
   * ACL state via cross-chain event propagation — usually within ~10 blocks (a
   * few seconds). You do not need to wait: delegated decryption rides out that
   * window with a bounded internal retry, so you can decrypt right after this
   * resolves.
   *
   * @param contractAddress - The confidential contract address to delegate on, or
   *   {@link WILDCARD_CONTRACT} to cover every contract with a single delegation.
   * @param delegateAddress - Address to delegate decryption rights to.
   * @param expirationDate - Optional expiration date (defaults to permanent delegation via `uint64.max`).
   * @returns The transaction hash and mined receipt.
   * @throws if no signer is configured. {@link SignerNotConfiguredError}
   * @throws if signer and provider are on different chains. {@link ChainMismatchError}
   * @throws if `expirationDate` is less than 1 hour in the future. {@link DelegationExpirationTooSoonError}
   * @throws if the delegate equals the connected wallet. {@link DelegationSelfNotAllowedError}
   * @throws if the delegate is the wildcard address. {@link DelegationDelegateCannotBeWildcardError}
   * @throws if the delegate equals the contract address. {@link DelegationDelegateEqualsContractError}
   * @throws if the new expiry equals the current one. {@link DelegationExpiryUnchangedError}
   * @throws if the delegation transaction reverts. {@link TransactionRevertedError}
   */
  async delegateDecryption({
    contractAddress,
    delegateAddress,
    expirationDate,
  }: {
    contractAddress: Address;
    delegateAddress: Address;
    expirationDate?: Date;
  }): Promise<TransactionResult> {
    const signer = this.#requireSigner("delegateDecryption");
    const account = await requireAlignedWalletAccount(
      "delegateDecryption",
      this.#signer,
      this.#provider,
    );
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
  async revokeDelegation({
    contractAddress,
    delegateAddress,
  }: {
    contractAddress: Address;
    delegateAddress: Address;
  }): Promise<TransactionResult> {
    const signer = this.#requireSigner("revokeDelegation");
    const account = await requireAlignedWalletAccount(
      "revokeDelegation",
      this.#signer,
      this.#provider,
    );
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

  /**
   * Get activity and expiry together in a single on-chain read, instead of
   * calling {@link isActive} and {@link getExpiry} separately.
   *
   * Signer-independent: works without a configured signer.
   *
   * @param contractAddress - The confidential contract address.
   * @param delegatorAddress - The address that granted the delegation.
   * @param delegateAddress - The address that received delegation rights.
   * @returns `{ isActive, expiryTimestamp }` — activity and the raw expiry timestamp together.
   */
  async getStatus(params: {
    contractAddress: Address;
    delegatorAddress: Address;
    delegateAddress: Address;
  }): Promise<DelegationStatus> {
    return this.#delegationService.getStatus(params);
  }
}
