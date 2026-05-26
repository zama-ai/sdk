import type { Address } from "viem";
import type { GenericSigner, GenericStorage, WalletAccount } from "../types";
import type { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import { ZamaError } from "../errors/base";
import { WorkerUnavailableError } from "../errors/relayer";
import { wrapSigningError } from "../errors/signing";
import { swallow } from "../utils/swallow";
import { KeypairVault } from "./keypair-vault";
import { chunkContracts, findPermitToWiden, sortedUnion, uncoveredContracts } from "./permissions";
import { PermissionStore } from "./permission-store";
import type { PermissionScope } from "./storage-keys";
import type { CredentialBundle, Permission, StoredKeypair } from "./types";
import type { ChecksummedAddress } from "../schemas/primitives";
import { checksum } from "../schemas/primitives";
import { normalizeAddresses, nowSeconds, SECONDS_PER_DAY } from "./utils";

export const DEFAULT_KEYPAIR_TTL_SECONDS = 30 * SECONDS_PER_DAY;
export const DEFAULT_PERMIT_DURATION_DAYS = 30;

/** Configuration for {@link CredentialService}. TTLs are pre-validated by the caller. */
export interface CredentialServiceConfig {
  relayer: RelayerDispatcher;
  signer: GenericSigner;
  /** Keypair lifetime in seconds. Pre-validated. */
  keypairTTL: number;
  /** Permit lifetime in days. Pre-validated. */
  permitTTL: number;
  /** Backing storage for keypairs (and permits if `permitStorage` is omitted). */
  storage: GenericStorage;
  /** Optional dedicated storage for permits; defaults to `storage`. */
  permitStorage?: GenericStorage;
}

/**
 * Single facade coordinating the keypair vault and the permission store.
 *
 * `CredentialService` is the only credentials object held by `ZamaSDK`. It accepts identity
 * transitions via `handleWalletAccountChange`.
 */
export class CredentialService {
  readonly #vault: KeypairVault;
  readonly #store: PermissionStore;
  readonly #relayer: RelayerDispatcher;
  readonly #signer: GenericSigner;
  readonly #permitTTL: number;

  constructor(config: CredentialServiceConfig) {
    this.#vault = new KeypairVault({
      generator: (chainId) => config.relayer.generateKeypair({ chainId }),
      storage: config.storage,
      ttl: config.keypairTTL,
    });
    this.#store = new PermissionStore({
      storage: config.permitStorage ?? config.storage,
    });
    this.#relayer = config.relayer;
    this.#signer = config.signer;
    this.#permitTTL = config.permitTTL;
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
  async grantPermit(contracts: readonly Address[], delegator?: Address): Promise<CredentialBundle> {
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
        const widened = await this.#signPermit({ chunk: widenedSet, keypair, scope });
        await swallow("replace permit", () =>
          this.#store.replace(scope, candidate.signature, widened),
        );
        permits[permits.indexOf(candidate)] = widened;
      } else {
        for (const chunk of chunkContracts(uncovered)) {
          const permission = await this.#signPermit({ chunk, keypair, scope });
          permits.push(permission);
          await swallow("persist permit", () => this.#store.append(scope, [permission]));
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
   * Apply a wallet account transition.
   *
   * Address change clears persisted credentials for the previous account and
   * eagerly warms a keypair for the new one so the first decrypt does not stall
   * on key generation. Chain-only changes keep credentials intact because
   * permits are chain-scoped already and stale decrypt plaintext is cleared by
   * `ZamaSDK`.
   *
   * Warmup routes generation through the connected account's `chainId` rather
   * than the dispatcher's active chain — required so a wallet connected to
   * (say) Anvil never hits the mainnet relayer just because mainnet is
   * `chains[0]`. {@link WorkerUnavailableError} is treated as expected (e.g.
   * Next.js SSR) and silenced; the SDK is reconstructed client-side and the
   * first real decrypt will lazily generate the keypair.
   */
  async handleWalletAccountChange(prev?: WalletAccount, next?: WalletAccount): Promise<void> {
    const prevAddr = prev ? checksum(prev.address) : undefined;
    const nextAddr = next ? checksum(next.address) : undefined;
    if (prevAddr === nextAddr) {
      return;
    }
    if (prevAddr) {
      await this.#vault.clear(prevAddr);
      await this.#store.clearAllForSigner(prevAddr);
    }
    if (nextAddr) {
      try {
        await this.#vault.getOrCreate(nextAddr, next?.chainId);
      } catch (error) {
        if (error instanceof WorkerUnavailableError) {
          return;
        }
        // oxlint-disable-next-line no-console
        console.warn("[zama-sdk] warm keypair failed:", error);
      }
    }
  }

  async #signPermit(input: {
    chunk: ChecksummedAddress[];
    keypair: StoredKeypair;
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
