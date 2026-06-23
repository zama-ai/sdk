import type { Address } from "viem";
import type { GenericSigner, GenericStorage } from "../types";
import type { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import { ZamaError } from "../errors/base";
import { wrapSigningError } from "../errors/signing";
import { swallow } from "../utils/swallow";
import { TransportKeyPairVault } from "./keypair-vault";
import { chunkContracts, findPermitToWiden, sortedUnion, uncoveredContracts } from "./permissions";
import { PermissionStore } from "./permission-store";
import type { PermissionScope } from "./storage-keys";
import type {
  StoredTransportKeyPairWithPermits,
  Permission,
  StoredTransportKeyPair,
} from "./types";
import type { ChecksummedAddress } from "../schemas/primitives";
import { checksum } from "../schemas/primitives";
import type { GenericLogger } from "../worker/worker.types";
import { normalizeAddresses, nowSeconds, SECONDS_PER_DAY } from "./utils";

export const DEFAULT_TRANSPORT_KEY_PAIR_TTL_SECONDS = 30 * SECONDS_PER_DAY;
export const DEFAULT_PERMIT_DURATION_DAYS = 30;

/** Configuration for {@link CredentialService}. TTLs are pre-validated by the caller. */
export interface CredentialServiceConfig {
  relayer: RelayerDispatcher;
  signer: GenericSigner;
  /** Transport key pair lifetime in seconds. Pre-validated. */
  transportKeyPairTTL: number;
  /** Permit lifetime in days. Pre-validated. */
  permitTTL: number;
  /** Backing storage for transport key pairs (and permits if `permitStorage` is omitted). */
  storage: GenericStorage;
  /** Optional dedicated storage for permits; defaults to `storage`. */
  permitStorage?: GenericStorage;
  /** SDK-wide logger for credential-path diagnostics. */
  logger: GenericLogger;
}

/**
 * Single facade coordinating the keypair vault and the permission store.
 *
 * `CredentialService` is the only credentials object held by `ZamaSDK`. It accepts identity
 * transitions via `handleWalletAccountChange`.
 */
export class CredentialService {
  readonly #vault: TransportKeyPairVault;
  readonly #store: PermissionStore;
  readonly #relayer: RelayerDispatcher;
  readonly #signer: GenericSigner;
  readonly #permitTTL: number;
  readonly #logger: GenericLogger;

  constructor(config: CredentialServiceConfig) {
    this.#vault = new TransportKeyPairVault({
      generator: () => config.relayer.generateTransportKeyPair(),
      storage: config.storage,
      ttl: config.transportKeyPairTTL,
      logger: config.logger,
    });
    this.#store = new PermissionStore({
      storage: config.permitStorage ?? config.storage,
      logger: config.logger,
    });
    this.#relayer = config.relayer;
    this.#signer = config.signer;
    this.#permitTTL = config.permitTTL;
    this.#logger = config.logger;
  }

  /**
   * Resolve a keypair and permissions covering `contracts`, minimizing wallet
   * prompts by reusing or widening existing permits where possible. Empty
   * `contracts` warms the keypair without prompting.
   *
   * @returns The resolved keypair and permits covering the requested contracts.
   * @throws if the user rejects a wallet signature prompt. {@link SigningRejectedError}
   * @throws if signing fails for any other reason. {@link SigningFailedError}
   */
  async grantPermit(
    contracts: readonly Address[],
    delegator?: Address,
  ): Promise<StoredTransportKeyPairWithPermits> {
    const account = this.#signer.requireWalletAccount("grantPermit");
    const signerAddress = checksum(account.address);
    const requested = normalizeAddresses(contracts);
    const keypair = await this.#vault.getOrCreate(signerAddress);
    if (requested.length === 0) {
      return { keypair, permits: [] };
    }

    const chainId = account.chainId;
    const scope: PermissionScope = {
      signerAddress,
      chainId,
      delegatorAddress: delegator ? checksum(delegator) : signerAddress,
    };
    const permits = await this.#store.listUsableAndPrune(scope, keypair.publicKey);

    const uncovered = uncoveredContracts(permits, requested);
    if (uncovered.length > 0) {
      const candidate = findPermitToWiden(permits, uncovered, requested);
      if (candidate !== null) {
        const widenedSet = sortedUnion(candidate.signedContractAddresses, uncovered);
        const widened = await this.#signPermit({
          chunk: widenedSet,
          keypair,
          scope,
        });
        await swallow(
          "replace permit",
          () => this.#store.replace(scope, candidate.signature, widened),
          this.#logger,
        );
        permits[permits.indexOf(candidate)] = widened;
      } else {
        for (const chunk of chunkContracts(uncovered)) {
          const permission = await this.#signPermit({ chunk, keypair, scope });
          permits.push(permission);
          await swallow(
            "persist permit",
            () => this.#store.append(scope, [permission]),
            this.#logger,
          );
        }
      }
    }

    const requestedSet = new Set(requested);
    return {
      keypair,
      permits: permits.filter((p) => p.signedContractAddresses.some((a) => requestedSet.has(a))),
    };
  }

  /**
   * Pure store lookup: are stored permits sufficient to cover `contracts`? No wallet prompt.
   *
   * @returns `true` if cached permits cover all requested contracts (vacuously
   *   true for an empty list); `false` if no keypair exists or coverage is
   *   incomplete.
   */
  async hasPermit(contracts: readonly Address[], delegator?: Address): Promise<boolean> {
    if (contracts.length === 0) {
      return true;
    }
    const account = this.#signer.walletAccount.getSnapshot();
    if (!account) {
      return false;
    }
    const signerAddress = checksum(account.address);
    const keypair = await this.#vault.readStored(signerAddress);
    if (keypair === null) {
      return false;
    }
    const chainId = account.chainId;
    const delegatorAddress = delegator ? checksum(delegator) : signerAddress;
    const scope: PermissionScope = { signerAddress, chainId, delegatorAddress };
    const permits = await this.#store.listUsableAndPrune(scope, keypair.publicKey);
    return uncoveredContracts(permits, normalizeAddresses(contracts)).length === 0;
  }

  /**
   * Wipe FHE permits for the current signer.
   *
   * - With no argument: every permit referencing this signer is removed across
   *   all chains and delegators. The keypair survives — use
   *   {@link clearCredentials} to also wipe the keypair.
   * - With a contract list: every signed permit in the direct-decrypt scope
   *   (current chain) whose immutable payload touches any listed address is
   *   removed. Delegated permits are not touched in this mode.
   *
   * @throws if reading the signer address fails. {@link SigningFailedError}
   */
  async revokePermits(contracts?: readonly Address[]): Promise<void> {
    const account = this.#signer.requireWalletAccount("revokePermits");
    const signerAddress = checksum(account.address);
    if (contracts === undefined) {
      await this.#store.clearAllForSigner(signerAddress);
      return;
    }
    const normalized = normalizeAddresses(contracts);
    if (normalized.length === 0) {
      return;
    }
    const chainId = account.chainId;
    await this.#store.deletePermitsTouching(
      { signerAddress, chainId, delegatorAddress: signerAddress },
      normalized,
    );
  }

  /**
   * Wipe the keypair for the current signer and cascade-delete every
   * permission referencing it across all chains and delegators.
   *
   * @throws if reading the signer address fails. {@link SigningFailedError}
   */
  async clearCredentials(): Promise<void> {
    const account = this.#signer.requireWalletAccount("clearCredentials");
    const signerAddress = checksum(account.address);
    await this.#vault.clear(signerAddress);
    await this.#store.clearAllForSigner(signerAddress);
  }

  /**
   * Warm the signer transport key pair cache for a known address.
   *
   * Best-effort prefetch primitive: correctness still comes from `grantPermit`,
   * which lazily creates the transport key pair when needed. Errors (storage failure,
   * relayer 4xx, missing Worker in SSR) are **not** swallowed here — the caller
   * decides whether to log, ignore, or surface them.
   */
  async warmTransportKeyPair(address: Address): Promise<void> {
    await this.#vault.getOrCreate(checksum(address));
  }

  /**
   * Apply a wallet account transition.
   *
   * Address change clears persisted credentials for the previous account.
   * Chain-only changes keep credentials intact because permits are chain-scoped
   * already and stale decrypt plaintext is cleared by `ZamaSDK`.
   */
  async handleWalletAccountChange(
    prev?: { address: Address },
    next?: { address: Address },
  ): Promise<void> {
    const prevAddr = prev ? checksum(prev.address) : undefined;
    const nextAddr = next ? checksum(next.address) : undefined;
    if (prevAddr === nextAddr) {
      return;
    }
    if (prevAddr) {
      await this.#vault.clear(prevAddr);
      await this.#store.clearAllForSigner(prevAddr);
    }
  }

  async #signPermit(input: {
    chunk: ChecksummedAddress[];
    keypair: StoredTransportKeyPair;
    scope: PermissionScope;
  }): Promise<Permission> {
    const { chunk, keypair, scope } = input;
    const startTimestamp = nowSeconds();
    const isDelegated = scope.delegatorAddress !== scope.signerAddress;

    try {
      const eip712 = isDelegated
        ? await this.#relayer.createDelegatedUserDecryptEIP712(
            keypair.publicKey,
            chunk,
            scope.delegatorAddress,
            startTimestamp,
            this.#permitTTL,
          )
        : await this.#relayer.createEIP712(
            keypair.publicKey,
            chunk,
            startTimestamp,
            this.#permitTTL,
          );

      const signature = await this.#signer.signTypedData(eip712);

      return {
        keypairPublicKey: keypair.publicKey,
        signerAddress: scope.signerAddress,
        delegatorAddress: scope.delegatorAddress,
        chainId: scope.chainId,
        signedContractAddresses: chunk,
        signature,
        startTimestamp,
        durationDays: this.#permitTTL,
      };
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      throw wrapSigningError(error, "Credential signing failed");
    }
  }
}
