import { getAddress, type Address, type Hex } from "viem";
import {
  confidentialTransferAndCallContract,
  isConfidentialTokenValidContract,
} from "../contracts";
import {
  BalanceCheckUnavailableError,
  ConfigurationError,
  EncryptionFailedError,
  SignerNotConfiguredError,
  TransactionRevertedError,
  UnlistedConfidentialTokenError,
  VaultBatcherPausedError,
} from "../errors";
import type { EncryptedValue } from "../relayer/types";
import { Token, type WrappedToken } from "../token";
import type { GenericSigner, TransactionResult, WriteContractConfig } from "../types";
import { requireAlignedWalletAccount } from "../utils/alignment";
import { assertConfidentialBalance } from "../utils/assert-balance";
import { memoizeAddressRead } from "../utils/memoize-address-read";
import { submitTransaction as submitSdkTransaction } from "../utils/submit-transaction";
import type { ZamaSDK } from "../zama-sdk";
import {
  encodeAllocationData,
  routerJoinContract,
  tokenWrapperRegistryContract,
  type EncryptedAllocationLeg,
} from "./contracts";
import { takeJoined } from "./events";
import type { JoinOptions, VaultAddresses } from "./types";
import { Vault } from "./vault";
import type { VaultBatcher } from "./vault-batcher";

type Direction = "deposit" | "redeem";

/** The most vaults a group may name: the router's per-transaction leg limit on the pull path, so a group is always exitable. */
export const MAX_GROUP_VAULTS = 10;

/** One vault of a group. */
export interface VaultMemberConfig extends VaultAddresses {
  /** What callers pass to `deposit` and `redeem` to pick this vault. */
  readonly id: string;
}

/** What {@link createVaultGroup} takes. */
export interface VaultGroupConfig {
  /** Names the group in error messages. */
  readonly id: string;
  /** The confidential wrapper of the asset every member takes deposits in. */
  readonly cAsset: Address;
  /** The router that fans a submission out across the members. */
  readonly router: Address;
  /** The members, in the order their legs are submitted. At least two: a single vault is a {@link Vault}. */
  readonly vaults: readonly VaultMemberConfig[];
}

/** A member of a {@link VaultGroup}. */
export interface VaultGroupMember {
  /** What callers pass to `deposit` and `redeem` to pick this vault. */
  readonly id: string;
  /** The vault, whose batchers are where claims and quits happen. */
  readonly vault: Vault;
}

/** Options for {@link VaultGroup.redeem}; a deposit takes plain {@link JoinOptions}. */
export interface VaultGroupRedeemOptions extends JoinOptions {
  /**
   * Unix timestamp until which the router's operator grant on each share
   * token is valid, for a grant this redemption has to make. Defaults to
   * now + 1 hour.
   */
  operatorUntil?: number;
}

/** What one leg's batcher reported. */
export interface VaultGroupJoin {
  /** The member this leg joined, by id. */
  vaultId: string;
  /** The batcher this leg joined, where its claim and quit happen. */
  batcher: Address;
  /** The token this leg spent: `cAsset` for a deposit, the member's share token for a redemption. */
  token: Address;
  /** The batch the leg landed in; what that batcher's `claim` and `quit` take. */
  batchId: bigint;
  /**
   * The encrypted amount credited. Zero for every leg but the chosen one, and
   * zero for that one too if `skipBalanceCheck` let a short balance through,
   * since an ERC-7984 transfer moves nothing rather than reverting.
   */
  confidentialJoinedAmount: EncryptedValue;
}

/** The transaction that joined every member, plus what each member's batcher reported. */
export interface VaultGroupJoinResult extends TransactionResult {
  /** The member the caller chose; every other leg is a decoy. */
  vaultId: string;
  /** One entry per leg, in group order, decoys included. */
  joins: readonly VaultGroupJoin[];
}

interface GroupLeg {
  readonly member: VaultGroupMember;
  readonly batcher: VaultBatcher;
  /** What this leg spends. */
  readonly token: WrappedToken;
  readonly vault: Address;
  readonly amount: bigint;
}

const SIDES = {
  deposit: {
    batcher: (vault: Vault) => vault.depositBatcher,
    token: (vault: Vault) => vault.cAsset(),
    // The batcher's asset side: what a deposit batcher pulls, what a redeem batcher pays out.
    asset: (vault: Vault) => vault.depositBatcher.fromToken(),
  },
  redeem: {
    batcher: (vault: Vault) => vault.redeemBatcher,
    token: (vault: Vault) => vault.cShare(),
    asset: (vault: Vault) => vault.redeemBatcher.toToken(),
  },
} as const;

function duplicate<T>(values: readonly T[]): T | undefined {
  const seen = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
  }
  return undefined;
}

/**
 * Vaults that take deposits in the same confidential asset, joined as one
 * through the router: a deposit into one member joins *every* member's batch,
 * the chosen vault with the amount and the rest with an encrypted zero.
 */
export class VaultGroup {
  /** The SDK the group reads and writes through. */
  readonly sdk: ZamaSDK;
  /** The configured group id, used in error messages. */
  readonly id: string;
  /** The shared asset wrapper, checksummed. */
  readonly cAsset: Address;
  /** The router every submission goes through, checksummed. */
  readonly router: Address;
  /** The members in leg order. */
  readonly members: readonly VaultGroupMember[];

  readonly #registry: () => Promise<Address>;

  constructor(sdk: ZamaSDK, config: VaultGroupConfig) {
    if (config.vaults.length < 2) {
      throw new ConfigurationError(
        `Vault group "${config.id}" names ${config.vaults.length} vault(s); a group needs at least two, and a single vault is a Vault`,
      );
    }
    if (config.vaults.length > MAX_GROUP_VAULTS) {
      throw new ConfigurationError(
        `Vault group "${config.id}" names ${config.vaults.length} vaults, above the ${MAX_GROUP_VAULTS} a submission can carry`,
      );
    }
    const members = config.vaults.map((member) => ({
      id: member.id,
      vault: new Vault(sdk, member),
    }));
    const duplicateId = duplicate(members.map((member) => member.id));
    if (duplicateId !== undefined) {
      throw new ConfigurationError(`Vault group "${config.id}" names "${duplicateId}" twice`);
    }
    const duplicateVault = duplicate(
      config.vaults.flatMap((member) => (member.vault ? [getAddress(member.vault)] : [])),
    );
    if (duplicateVault !== undefined) {
      throw new ConfigurationError(
        `Vault group "${config.id}" gives ${duplicateVault} as the vault of more than one member`,
      );
    }
    // A batcher serves one vault in one direction, so the same address anywhere twice is a mistake.
    const duplicateBatcher = duplicate(
      members.flatMap(({ vault }) => [vault.depositBatcher.address, vault.redeemBatcher.address]),
    );
    if (duplicateBatcher !== undefined) {
      throw new ConfigurationError(
        `Vault group "${config.id}" names batcher ${duplicateBatcher} more than once`,
      );
    }

    this.sdk = sdk;
    this.id = config.id;
    this.cAsset = getAddress(config.cAsset);
    this.router = getAddress(config.router);
    this.members = members;
    this.#registry = memoizeAddressRead(async () =>
      getAddress(await sdk.provider.readContract(tokenWrapperRegistryContract(this.router))),
    );
  }

  /** Whether the router's registry lists `cAsset`, which a deposit requires. Not cached: a listing can be revoked. */
  async isAssetListed(): Promise<boolean> {
    return this.sdk.provider.readContract(
      isConfidentialTokenValidContract(await this.#registry(), this.cAsset),
    );
  }

  /**
   * One member by id.
   *
   * @throws if no member has id `vaultId`. {@link ConfigurationError}
   */
  member(vaultId: string): VaultGroupMember {
    const member = this.members.find((candidate) => candidate.id === vaultId);
    if (!member) {
      throw new ConfigurationError(`Vault group "${this.id}" has no vault "${vaultId}"`);
    }
    return member;
  }

  /**
   * Deposit the confidential asset into one member of the group, joining every
   * member's current deposit batch in one transaction.
   *
   * @param vaultId - The member to deposit into.
   * @param amount - The plaintext amount; encrypted before submission.
   *
   * @remarks
   * There is no `beneficiary`: the router credits the account the legs came
   * from, so a group deposit cannot be made on someone else's behalf.
   *
   * @throws if no member has id `vaultId`, a member's batchers disagree with its config or are not paired with `cAsset`, or two members' batchers report the same vault. {@link ConfigurationError}
   * @throws if a member's deposit batcher is paused. {@link VaultBatcherPausedError}
   * @throws if the router's registry does not list `cAsset`. {@link UnlistedConfidentialTokenError}
   * @throws if the balance is less than `amount`. {@link InsufficientConfidentialBalanceError}
   * @throws if balance validation requires decryption that is not possible. {@link BalanceCheckUnavailableError}
   * @throws if the mined transaction's receipt has no `Joined` event for a leg. {@link TransactionRevertedError}
   */
  async deposit(
    vaultId: string,
    amount: bigint,
    options?: JoinOptions,
  ): Promise<VaultGroupJoinResult> {
    const { member, signer, holder } = await this.#caller("deposit", vaultId);
    // Read alongside the legs, so an unlisted asset fails before the balance check can prompt the wallet.
    const [legs] = await Promise.all([
      this.#legs("deposit", member, amount),
      this.#requireAssetListed(),
    ]);
    await this.#assertBalance("deposit", member, amount, legs, signer, options);

    // One encryption per verifying contract: the asset checks the transfer's proof, the router the allocation's.
    const [transfer, allocation] = await Promise.all([
      this.sdk.encrypt({
        values: [{ value: amount, type: "euint64" }],
        contractAddress: this.cAsset,
        userAddress: holder,
      }),
      this.#encryptLegs(holder, legs),
    ]);
    const [encryptedAmount] = transfer.encryptedValues;
    if (!encryptedAmount) {
      throw new EncryptionFailedError("Encryption returned no encrypted values");
    }
    const transaction = await this.#submitTransaction(
      signer,
      confidentialTransferAndCallContract(
        this.cAsset,
        this.router,
        encryptedAmount,
        transfer.inputProof,
        encodeAllocationData(allocation.legs, allocation.inputProof),
      ),
    );
    return this.#result(vaultId, holder, legs, transaction);
  }

  /**
   * Redeem shares of one member of the group by joining every member's
   * current redeem batch in one transaction, each leg with its own share token.
   *
   * @param vaultId - The member to redeem from.
   * @param amount - The plaintext amount of shares: ERC-4626 `redeem`, not
   *   `withdraw`, so this is denominated in shares, never in assets.
   *
   * @remarks
   * The router pulls every leg's share token, so before the join this grants
   * it an operator approval on each member's share token that lacks one. Each
   * grant is its own wallet prompt, so a first redemption from a group of N
   * vaults can ask the user to sign up to N + 1 times. The balance check
   * decrypts every member's share balance, not only the chosen one's.
   *
   * @throws if no member has id `vaultId`, a member's batchers disagree with its config or are not paired with `cAsset`, or two members' batchers report the same vault. {@link ConfigurationError}
   * @throws if a member's redeem batcher is paused. {@link VaultBatcherPausedError}
   * @throws if the balance is less than `amount`. {@link InsufficientConfidentialBalanceError}
   * @throws if balance validation requires decryption that is not possible. {@link BalanceCheckUnavailableError}
   * @throws if the mined transaction's receipt has no `Joined` event for a leg. {@link TransactionRevertedError}
   */
  async redeem(
    vaultId: string,
    amount: bigint,
    options?: VaultGroupRedeemOptions,
  ): Promise<VaultGroupJoinResult> {
    const { member, signer, holder } = await this.#caller("redeem", vaultId);
    // A router address with no registry to read fails here, before anything is granted to it.
    const [legs] = await Promise.all([this.#legs("redeem", member, amount), this.#registry()]);
    await this.#assertBalance("redeem", member, amount, legs, signer, options);

    // Encrypted before the grants, which cost the user a signature each; a proof does not expire.
    const allocation = await this.#encryptLegs(holder, legs);
    const tokens = [...new Map(legs.map((leg) => [leg.token.address, leg.token])).values()];
    const grants = await Promise.all(
      tokens.map(async (token) => ({
        token,
        granted: await token.isOperator(holder, this.router),
      })),
    );
    for (const { token } of grants.filter((grant) => !grant.granted)) {
      await token.setOperator(this.router, options?.operatorUntil);
    }
    const transaction = await this.#submitTransaction(
      signer,
      routerJoinContract(this.router, allocation.legs, allocation.inputProof),
    );
    return this.#result(vaultId, holder, legs, transaction);
  }

  // INTERNAL

  async #caller(
    direction: Direction,
    vaultId: string,
  ): Promise<{ member: VaultGroupMember; signer: GenericSigner; holder: Address }> {
    const member = this.member(vaultId);
    const signer = this.sdk.signer;
    if (!signer) {
      throw new SignerNotConfiguredError(direction);
    }
    const account = await requireAlignedWalletAccount(direction, signer, this.sdk.provider);
    return { member, signer, holder: getAddress(account.address) };
  }

  // Every member gets a leg, zero-amount ones included: trimming them would reveal which vault was chosen.
  async #legs(
    direction: Direction,
    member: VaultGroupMember,
    amount: bigint,
  ): Promise<readonly GroupLeg[]> {
    const legs = await Promise.all(
      this.members.map((candidate) =>
        this.#leg(direction, candidate, candidate === member ? amount : 0n),
      ),
    );
    // The constructor's check only sees configured addresses; the batchers' reports can still name one vault twice.
    const duplicateVault = duplicate(legs.map((leg) => leg.vault));
    if (duplicateVault !== undefined) {
      throw new ConfigurationError(
        `Vault group "${this.id}" has two members whose batchers report the same vault ${duplicateVault}`,
      );
    }
    return legs;
  }

  // One paused batcher reverts the whole submission, so every leg's is read, not just the chosen one's.
  async #leg(direction: Direction, member: VaultGroupMember, amount: bigint): Promise<GroupLeg> {
    const side = SIDES[direction];
    const batcher = side.batcher(member.vault);
    const [vault, token, asset, paused] = await Promise.all([
      member.vault.vaultAddress(),
      side.token(member.vault),
      side.asset(member.vault),
      batcher.paused(),
    ]);
    if (getAddress(asset) !== this.cAsset) {
      throw new ConfigurationError(
        `Batcher ${batcher.address} of vault "${member.id}" is paired with ${asset}, but group "${this.id}" is configured with ${this.cAsset}`,
      );
    }
    if (paused) {
      throw new VaultBatcherPausedError(
        `Batcher ${batcher.address} of vault "${member.id}" in group "${this.id}" is paused, so no member can be joined until it resumes`,
        { batcher: batcher.address, vaultId: member.id },
      );
    }
    return { member, batcher, token, vault, amount };
  }

  // A short balance joins every batch with nothing and still costs the transaction.
  async #assertBalance(
    direction: Direction,
    member: VaultGroupMember,
    amount: bigint,
    legs: readonly GroupLeg[],
    signer: GenericSigner,
    options: JoinOptions | undefined,
  ): Promise<void> {
    if (options?.skipBalanceCheck) {
      return;
    }
    const token = await SIDES[direction].token(member.vault);
    // Every leg's token is decrypted, not just the chosen one's: a lone decrypt would tell the relayer which vault was picked.
    const tokens = [...new Map(legs.map((leg) => [leg.token.address, leg.token])).values()];
    await assertConfidentialBalance({
      operation: direction,
      tokenAddress: token.address,
      amount,
      signer,
      provider: this.sdk.provider,
      readBalance: async (owner) => {
        const { results, errors } = await Token.batchBalancesOf(tokens, owner);
        const balance = results.get(token.address);
        if (balance === undefined) {
          throw (
            errors.get(token.address) ??
            new BalanceCheckUnavailableError(`Balance validation failed (token: ${token.address})`)
          );
        }
        return balance;
      },
    });
  }

  // Bound to the router rather than the batchers or the tokens: the router is the contract that verifies the proof.
  async #encryptLegs(
    holder: Address,
    legs: readonly GroupLeg[],
  ): Promise<{ legs: readonly EncryptedAllocationLeg[]; inputProof: Hex }> {
    const { encryptedValues, inputProof } = await this.sdk.encrypt({
      values: legs.map((leg) => ({ value: leg.amount, type: "euint64" as const })),
      contractAddress: this.router,
      userAddress: holder,
    });
    if (encryptedValues.length !== legs.length) {
      throw new EncryptionFailedError(
        `Encryption returned ${encryptedValues.length} values for ${legs.length} legs`,
      );
    }
    return {
      legs: legs.map((leg, index) => ({
        batcher: leg.batcher.address,
        token: leg.token.address,
        amount: encryptedValues[index] as EncryptedValue,
      })),
      inputProof,
    };
  }

  // The router rejects a push of an unlisted token with a revert that costs the caller a transaction.
  async #requireAssetListed(): Promise<void> {
    if (!(await this.isAssetListed())) {
      throw new UnlistedConfidentialTokenError(
        `The vault router's registry does not list ${this.cAsset}, so it would reject a transfer of it`,
        { token: this.cAsset, registry: await this.#registry() },
      );
    }
  }

  #submitTransaction(
    signer: GenericSigner,
    config: WriteContractConfig,
  ): Promise<TransactionResult> {
    return submitSdkTransaction({
      operation: "vault:routerJoin",
      signer,
      provider: this.sdk.provider,
      config,
      emit: (input) => this.sdk.emitEvent(input, this.router),
      logger: this.sdk.logger,
    });
  }

  #result(
    vaultId: string,
    holder: Address,
    legs: readonly GroupLeg[],
    transaction: TransactionResult,
  ): VaultGroupJoinResult {
    // Each log is consumed once: the router joins the legs in order, so the
    // Nth match is the Nth leg's even when the adapter omits log addresses.
    const logs = [...transaction.receipt.logs];
    const joins = legs.map((leg) => {
      const joined = takeJoined(logs, leg.batcher.address, holder);
      if (!joined) {
        throw new TransactionRevertedError(
          `Transaction ${transaction.txHash} was mined, but its receipt has no Joined event for ${holder} from batcher ${leg.batcher.address} of vault "${leg.member.id}"`,
        );
      }
      return {
        vaultId: leg.member.id,
        batcher: leg.batcher.address,
        token: leg.token.address,
        batchId: joined.batchId,
        confidentialJoinedAmount: joined.confidentialAmount,
      };
    });
    return { ...transaction, vaultId, joins };
  }
}

/**
 * Create a {@link VaultGroup} bound to `sdk`.
 *
 * @example
 * ```ts
 * import { createVaultGroup } from "@zama-fhe/sdk/vaults";
 *
 * const group = createVaultGroup(sdk, {
 *   id: "stable",
 *   cAsset: "0xConfidentialAsset",
 *   router: "0xRouter",
 *   vaults: [
 *     { id: "alpha", depositBatcher: "0xAlphaDeposit", redeemBatcher: "0xAlphaRedeem" },
 *     { id: "beta", depositBatcher: "0xBetaDeposit", redeemBatcher: "0xBetaRedeem" },
 *   ],
 * });
 * const { joins } = await group.deposit("alpha", 1_000_000n);
 * ```
 */
export function createVaultGroup(sdk: ZamaSDK, config: VaultGroupConfig): VaultGroup {
  return new VaultGroup(sdk, config);
}
