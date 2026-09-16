import { getAddress, type Address, type Hex } from "viem";
import { isConfidentialTokenValidContract } from "../contracts";
import {
  ConfigurationError,
  EncryptionFailedError,
  SignerNotConfiguredError,
  TransactionRevertedError,
  UnlistedConfidentialTokenError,
  ZamaError,
} from "../errors";
import { Token } from "../token";
import type { TransactionResult, WriteContractConfig } from "../types";
import { requireAlignedWalletAccount } from "../utils/alignment";
import type { ZamaSDK } from "../zama-sdk";
import type { AllocationLeg, EncryptedAllocation } from "./allocation";
import { routerJoinContract, tokenWrapperRegistryContract } from "./contracts";

/** Options for {@link VaultRouter.join}. */
export interface VaultRouterJoinOptions {
  /**
   * Unix timestamp until which the router's operator grant on each leg's token
   * is valid. Only used where a grant isn't already active. Defaults to
   * `Token.setOperator`'s own default.
   */
  operatorDeadline?: number;
}

/**
 * The contract that turns one submission into a join on each of several
 * batchers. It submits the legs it is given and decides nothing about them.
 *
 * Most callers should reach for {@link VaultGroup}, which builds the legs.
 */
export class VaultRouter {
  /** The SDK instance this router reads and writes through. */
  readonly sdk: ZamaSDK;
  /** Checksummed address of the router contract. */
  readonly address: Address;

  #tokenWrapperRegistry: Promise<Address> | null = null;

  constructor(sdk: ZamaSDK, address: Address) {
    this.sdk = sdk;
    this.address = getAddress(address);
  }

  /**
   * The registry the router checks a token against before accepting a pushed
   * transfer. Immutable on chain, so it is resolved once and cached.
   */
  async tokenWrapperRegistry(): Promise<Address> {
    this.#tokenWrapperRegistry ??= this.sdk.provider
      .readContract(tokenWrapperRegistryContract(this.address))
      .then((address: Address) => getAddress(address))
      .catch((error: unknown) => {
        this.#tokenWrapperRegistry = null;
        throw error;
      });
    return this.#tokenWrapperRegistry;
  }

  /**
   * Whether the router's registry lists `token`, which is what it gates a
   * pushed transfer on. Governance can revoke a listing, so ask per submission
   * rather than caching the answer for a session.
   */
  async isTokenListed(token: Address): Promise<boolean> {
    const registry = await this.tokenWrapperRegistry();
    return this.sdk.provider.readContract(
      isConfidentialTokenValidContract(registry, getAddress(token)),
    );
  }

  /**
   * Fail before submitting anything if the router would reject a push of
   * `token`, which it does with a revert that costs the caller a transaction.
   *
   * @throws {@link UnlistedConfidentialTokenError} if the registry does not list `token`.
   */
  async requireTokenListed(token: Address): Promise<void> {
    const normalized = getAddress(token);
    if (await this.isTokenListed(normalized)) {
      return;
    }
    throw new UnlistedConfidentialTokenError(
      `The vault router's registry does not list ${normalized}, so it would reject a transfer of it`,
      { token: normalized, registry: await this.tokenWrapperRegistry() },
    );
  }

  /**
   * Encrypt a leg set as one FHE input bound to this router.
   *
   * The binding is the router, not the batchers or the tokens, because the
   * router is the contract that verifies the proof.
   */
  async encryptAllocation(legs: readonly AllocationLeg[]): Promise<EncryptedAllocation> {
    const account = await requireAlignedWalletAccount(
      "encryptAllocation",
      this.sdk.signer,
      this.sdk.provider,
    );
    return this.#encryptAllocation(getAddress(account.address), legs);
  }

  /**
   * Pull every leg's token from the caller and join each leg's batcher, in one
   * transaction. Grants the router an ERC-7984 operator approval on each
   * distinct token first, unless one is already active.
   *
   * @param legs - One leg per vault of the group, with plaintext amounts.
   * @param options - Optional `operatorDeadline`.
   *
   * @remarks
   * FHE compute grows with the leg count, and enough legs exceed what one
   * transaction may spend.
   */
  async join(
    legs: readonly AllocationLeg[],
    options?: VaultRouterJoinOptions,
  ): Promise<TransactionResult> {
    if (legs.length === 0) {
      throw new ConfigurationError("A router join needs at least one leg");
    }
    const account = await requireAlignedWalletAccount("join", this.sdk.signer, this.sdk.provider);
    const holder = getAddress(account.address);

    await this.#ensureOperators(holder, legs, options?.operatorDeadline);
    const allocation = await this.#encryptAllocation(holder, legs);
    return this.#submitTransaction(
      "join",
      routerJoinContract(this.address, allocation.legs, allocation.inputProof),
    );
  }

  // INTERNAL

  async #encryptAllocation(
    holder: Address,
    legs: readonly AllocationLeg[],
  ): Promise<EncryptedAllocation> {
    const { encryptedValues, inputProof } = await this.sdk.encrypt({
      values: legs.map((leg) => ({ value: leg.amount, type: "euint64" as const })),
      contractAddress: this.address,
      userAddress: holder,
    });
    if (encryptedValues.length !== legs.length) {
      throw new EncryptionFailedError(
        `Encryption returned ${encryptedValues.length} handles for ${legs.length} legs`,
      );
    }
    return {
      legs: legs.map((leg, index) => ({
        batcher: getAddress(leg.batcher),
        token: getAddress(leg.token),
        // Index-paired with the values submitted above, whose count was just checked.
        amount: encryptedValues[index] as Hex,
      })),
      inputProof,
    };
  }

  /**
   * The router pulls with `confidentialTransferFrom`, which ERC-7984 rejects
   * unless the router is already an operator of the caller.
   */
  async #ensureOperators(
    holder: Address,
    legs: readonly AllocationLeg[],
    until: number | undefined,
  ): Promise<void> {
    for (const address of new Set(legs.map((leg) => getAddress(leg.token)))) {
      const token = new Token(this.sdk, address);
      if (!(await token.isOperator(holder, this.address))) {
        await token.setOperator(this.address, until);
      }
    }
  }

  async #submitTransaction(
    operation: string,
    config: WriteContractConfig,
  ): Promise<TransactionResult> {
    const signer = this.sdk.signer;
    if (!signer) {
      throw new SignerNotConfiguredError(operation);
    }
    try {
      const txHash: Hex = await signer.writeContract(config);
      const receipt = await this.sdk.provider.waitForTransactionReceipt(txHash);
      return { txHash, receipt };
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      throw new TransactionRevertedError(`VaultRouter transaction failed during ${operation}`, {
        cause: error,
      });
    }
  }
}
