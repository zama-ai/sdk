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
import type { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import type {
  GenericProvider,
  GenericSigner,
  TransactionResult,
  WriteContractConfig,
} from "../types";
import { submitTransaction } from "../utils/submit-transaction";
import type { LoggerService } from "./logger-service";

type AclTransactionOperation = Extract<
  TransactionOperation,
  "delegateDecryption" | "revokeDelegation"
>;

export class DelegationService {
  readonly #provider: GenericProvider;
  readonly #relayer: RelayerDispatcher;
  readonly #emitEvent: (input: ZamaSDKEventInput, tokenAddress?: Address) => void;
  readonly #logger: LoggerService;

  constructor({
    provider,
    relayer,
    emitEvent = () => {},
    logger,
  }: {
    provider: GenericProvider;
    relayer: RelayerDispatcher;
    logger: LoggerService;
    emitEvent?: (input: ZamaSDKEventInput, tokenAddress?: Address) => void;
  }) {
    this.#provider = provider;
    this.#relayer = relayer;
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

    const acl = await this.#relayer.getAclAddress();
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
      this.#logger.warn("delegateDecryption: pre-flight expiry check failed", {
        error,
      });
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
    }: {
      contractAddress: Address;
      delegateAddress: Address;
      delegatorAddress: Address;
    },
  ): Promise<TransactionResult> {
    const normalizedContract = getAddress(contractAddress);
    const normalizedDelegate = getAddress(delegateAddress);
    const normalizedDelegator = getAddress(delegatorAddress);
    const acl = await this.#relayer.getAclAddress();

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
    const expiry = await this.getDelegationExpiry(params);
    if (expiry === 0n) {
      return false;
    }
    if (expiry === MAX_UINT64) {
      return true;
    }
    const now = await this.#provider.getBlockTimestamp();
    return expiry > now;
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
    const acl = await this.#relayer.getAclAddress();
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
    const expiry = await this.getDelegationExpiry({
      contractAddress: normalizedContract,
      delegatorAddress: normalizedDelegator,
      delegateAddress: normalizedDelegate,
    });
    if (expiry === 0n) {
      throw new DelegationNotFoundError(
        `No active delegation from ${normalizedDelegator} to ${normalizedDelegate} for ${normalizedContract}`,
      );
    }
    if (expiry !== MAX_UINT64) {
      const now = await this.#provider.getBlockTimestamp();
      if (expiry <= now) {
        throw new DelegationExpiredError(
          `Delegation from ${normalizedDelegator} to ${normalizedDelegate} for ${normalizedContract} has expired`,
        );
      }
    }
  }
}
