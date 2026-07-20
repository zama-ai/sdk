import { getAddress, type Address } from "viem";
import {
  delegateForUserDecryptionContract,
  getDelegationExpiryContract,
  MAX_UINT64,
  revokeDelegationContract,
} from "../contracts";
import {
  DelegationDelegateEqualsContractError,
  DelegationExpirationTooSoonError,
  DelegationExpiredError,
  DelegationExpiryUnchangedError,
  DelegationNotFoundError,
  DelegationSelfNotAllowedError,
  TransactionRevertedError,
} from "../errors";
import { matchAclRevert } from "../errors/acl-revert";
import type { TransactionOperation, ZamaSDKEventInput } from "../events/sdk-events";
import type { ChainRouter } from "../chains/router";
import type {
  GenericLogger,
  GenericProvider,
  GenericSigner,
  TransactionResult,
  WriteContractConfig,
} from "../types";
import { submitTransaction } from "../utils/submit-transaction";

type AclTransactionOperation = Extract<
  TransactionOperation,
  "delegateDecryption" | "revokeDelegation"
>;

/** Delegation activity and expiry, resolved from a single expiry read. */
export interface DelegationStatus {
  isActive: boolean;
  expiryTimestamp: bigint;
}

/** @internal */
export class DelegationService {
  readonly #router: ChainRouter;
  readonly #provider: GenericProvider;
  readonly #emitEvent: (input: ZamaSDKEventInput, tokenAddress?: Address) => void;
  readonly #logger: GenericLogger;

  constructor({
    provider,
    router,
    emitEvent = () => {},
    logger,
  }: {
    provider: GenericProvider;
    router: ChainRouter;
    logger: GenericLogger;
    emitEvent?: (input: ZamaSDKEventInput, tokenAddress?: Address) => void;
  }) {
    this.#provider = provider;
    this.#router = router;
    this.#logger = logger;
    this.#emitEvent = emitEvent;
  }

  async delegateDecryption(
    signer: GenericSigner,
    {
      contractAddress,
      delegateAddress,
      delegatorAddress,
      expirationDate,
    }: {
      contractAddress: Address;
      delegateAddress: Address;
      delegatorAddress: Address;
      expirationDate?: Date;
    },
  ): Promise<TransactionResult> {
    if (expirationDate && expirationDate.getTime() < Date.now() + 3600_000) {
      throw new DelegationExpirationTooSoonError(
        "Expiration date must be at least 1 hour in the future",
      );
    }

    const normalizedContract = getAddress(contractAddress);
    const normalizedDelegate = getAddress(delegateAddress);
    const normalizedDelegator = getAddress(delegatorAddress);

    if (normalizedDelegate === normalizedDelegator) {
      throw new DelegationSelfNotAllowedError(
        "Cannot delegate to yourself (delegate === msg.sender).",
      );
    }

    if (normalizedDelegate === normalizedContract) {
      throw new DelegationDelegateEqualsContractError(
        `Delegate address cannot be the same as the contract address (${normalizedContract}).`,
      );
    }

    const acl = this.#router.relayer.chain.aclContractAddress;
    const expDate = expirationDate
      ? BigInt(Math.floor(expirationDate.getTime() / 1000))
      : MAX_UINT64;

    let currentExpiry: bigint;
    try {
      currentExpiry = await this.getDelegationExpiry({
        contractAddress: normalizedContract,
        delegatorAddress: normalizedDelegator,
        delegateAddress: normalizedDelegate,
      });
    } catch (error) {
      this.#logger.warn("delegateDecryption: pre-flight expiry check failed", { error });
      currentExpiry = -1n;
    }
    if (currentExpiry === expDate) {
      throw new DelegationExpiryUnchangedError(
        `The new expiration date (${expDate}) is the same as the current one. No on-chain change needed.`,
      );
    }

    return this.#submitAclTransaction({
      operation: "delegateDecryption",
      signer,
      contractAddress,
      config: delegateForUserDecryptionContract(
        acl,
        normalizedDelegate,
        normalizedContract,
        expDate,
      ),
    });
  }

  async revokeDelegation(
    signer: GenericSigner,
    {
      contractAddress,
      delegateAddress,
      delegatorAddress,
    }: { contractAddress: Address; delegateAddress: Address; delegatorAddress: Address },
  ): Promise<TransactionResult> {
    const normalizedContract = getAddress(contractAddress);
    const normalizedDelegate = getAddress(delegateAddress);
    const normalizedDelegator = getAddress(delegatorAddress);
    const acl = this.#router.relayer.chain.aclContractAddress;

    let currentExpiry: bigint;
    try {
      currentExpiry = await this.getDelegationExpiry({
        contractAddress: normalizedContract,
        delegatorAddress: normalizedDelegator,
        delegateAddress: normalizedDelegate,
      });
    } catch (error) {
      this.#logger.warn("revokeDelegation: pre-flight expiry check failed", { error });
      currentExpiry = 1n;
    }
    if (currentExpiry === 0n) {
      throw new DelegationNotFoundError(
        `No active delegation found for delegate ${normalizedDelegate} on contract ${normalizedContract}.`,
      );
    }

    return this.#submitAclTransaction({
      operation: "revokeDelegation",
      signer,
      contractAddress,
      config: revokeDelegationContract(acl, normalizedDelegate, normalizedContract),
    });
  }

  async isDelegated(params: {
    contractAddress: Address;
    delegatorAddress: Address;
    delegateAddress: Address;
  }): Promise<boolean> {
    return (await this.getStatus(params)).isActive;
  }

  /**
   * Resolve activity and expiry together from a single {@link getDelegationExpiry} read,
   * instead of two separate round trips through {@link isDelegated} and
   * {@link getDelegationExpiry}.
   */
  async getStatus(params: {
    contractAddress: Address;
    delegatorAddress: Address;
    delegateAddress: Address;
  }): Promise<DelegationStatus> {
    const expiryTimestamp = await this.getDelegationExpiry(params);
    if (expiryTimestamp === 0n) {
      return { isActive: false, expiryTimestamp };
    }
    if (expiryTimestamp === MAX_UINT64) {
      return { isActive: true, expiryTimestamp };
    }
    const now = await this.#provider.getBlockTimestamp();
    return { isActive: expiryTimestamp > now, expiryTimestamp };
  }

  async getDelegationExpiry({
    contractAddress,
    delegatorAddress,
    delegateAddress,
  }: {
    contractAddress: Address;
    delegatorAddress: Address;
    delegateAddress: Address;
  }): Promise<bigint> {
    const acl = this.#router.relayer.chain.aclContractAddress;
    return this.#provider.readContract(
      getDelegationExpiryContract(
        acl,
        getAddress(delegatorAddress),
        getAddress(delegateAddress),
        getAddress(contractAddress),
      ),
    );
  }

  async #submitAclTransaction({
    operation,
    signer,
    contractAddress,
    config,
  }: {
    operation: AclTransactionOperation;
    signer: GenericSigner;
    contractAddress: Address;
    config: WriteContractConfig;
  }): Promise<TransactionResult> {
    try {
      return await submitTransaction({
        operation,
        signer,
        provider: this.#provider,
        config,
        emit: (input) => this.#emitEvent(input, contractAddress),
        logger: this.#logger,
      });
    } catch (error) {
      this.#throwAclRevertIfMatched(error);
      throw error;
    }
  }

  #throwAclRevertIfMatched(error: unknown): void {
    if (!(error instanceof TransactionRevertedError)) {
      return;
    }
    const mapped = matchAclRevert(error.cause ?? error, error);
    if (mapped) {
      throw mapped;
    }
  }

  async findInactiveDelegations(
    contractAddresses: readonly Address[],
    delegatorAddress: Address,
    delegateAddress: Address,
  ): Promise<Map<Address, DelegationNotFoundError | DelegationExpiredError>> {
    const inactive = new Map<Address, DelegationNotFoundError | DelegationExpiredError>();
    await Promise.all(
      contractAddresses.map(async (contractAddress) => {
        try {
          await this.assertDelegationActive(contractAddress, delegatorAddress, delegateAddress);
        } catch (error) {
          if (error instanceof DelegationNotFoundError || error instanceof DelegationExpiredError) {
            const normalizedContract = getAddress(contractAddress);
            inactive.set(normalizedContract, error);
            return;
          }
          throw error;
        }
      }),
    );
    return inactive;
  }

  async assertDelegationActive(
    contractAddress: Address,
    delegatorAddress: Address,
    delegateAddress: Address,
  ): Promise<void> {
    const normalizedContract = getAddress(contractAddress);
    const normalizedDelegator = getAddress(delegatorAddress);
    const normalizedDelegate = getAddress(delegateAddress);
    const { isActive, expiryTimestamp } = await this.getStatus({
      contractAddress: normalizedContract,
      delegatorAddress: normalizedDelegator,
      delegateAddress: normalizedDelegate,
    });
    if (isActive) {
      return;
    }
    if (expiryTimestamp === 0n) {
      throw new DelegationNotFoundError(
        `No active delegation from ${normalizedDelegator} to ${normalizedDelegate} for ${normalizedContract}`,
      );
    }
    throw new DelegationExpiredError(
      `Delegation from ${normalizedDelegator} to ${normalizedDelegate} for ${normalizedContract} has expired`,
    );
  }
}
