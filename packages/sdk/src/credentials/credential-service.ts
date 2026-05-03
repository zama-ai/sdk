import type { Address } from "viem";
import type { GenericSigner, GenericStorage } from "../types";
import type { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import { ZamaError } from "../errors/base";
import { wrapSigningError } from "../errors/signing";
import { swallow } from "../utils/swallow";
import { KeypairVault } from "./keypair-vault";
import { chunkContracts, uncoveredContracts } from "./permissions";
import { PermissionStore } from "./permission-store";
import type { PermissionScope } from "./storage-keys";
import type { CredentialBundle, Permission, StoredKeypair } from "./types";
import type { ChecksummedAddress } from "./utils";
import { checksum, normalizeAddresses, nowSeconds, SECONDS_PER_DAY } from "./utils";

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
 * transitions via `handleIdentityChange`.
 */
export class CredentialService {
  readonly #vault: KeypairVault;
  readonly #store: PermissionStore;
  readonly #relayer: RelayerDispatcher;
  readonly #signer: GenericSigner;
  readonly #permitTTL: number;

  constructor(config: CredentialServiceConfig) {
    this.#vault = new KeypairVault({
      generator: () => config.relayer.generateKeypair(),
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

  /** Eagerly warm the current signer's keypair. */
  async initialize(): Promise<void> {
    // TODO: a better refactor of the signer system needs to be addressed for SSR concerns,
    // where we'd get a `get-or-undefined` rather than `get-or-throw` behavior.
    await swallow("credentials initialize", async () => {
      const address = await this.#signer.getAddress();
      await this.#vault.getOrCreate(checksum(address));
    });
  }

  /**
   * Resolve a keypair and the permissions covering `contracts`.
   *
   * Passing an empty contract list warms the keypair without creating signed
   * permits.
   *
   * If existing permissions already cover the requested set, no wallet prompt
   * occurs. Otherwise the uncovered subset is chunked into groups of ≤10 and
   * one permit per chunk is signed sequentially. Each signed chunk is persisted
   * before the next prompt, and newly signed permits are returned in-memory even
   * when best-effort persistence fails.
   *
   * @returns The resolved keypair and permits covering the requested contracts.
   * @throws {@link SigningRejectedError} if the user rejects a wallet signature prompt.
   * @throws {@link SigningFailedError} if signing fails for any other reason.
   */
  async allow(contracts: readonly Address[], delegator?: Address): Promise<CredentialBundle> {
    const signerAddress = checksum(await this.#signer.getAddress());
    const requested = normalizeAddresses(contracts);
    const keypair = await this.#vault.getOrCreate(signerAddress);
    if (requested.length === 0) {
      return { keypair, permits: [] };
    }

    const chainId = await this.#signer.getChainId();
    const scope: PermissionScope = {
      signerAddress,
      chainId,
      delegatorAddress: delegator ? checksum(delegator) : signerAddress,
    };
    const permits = await this.#store.listUsableAndPrune(scope, keypair.publicKey);

    for (const chunk of chunkContracts(uncoveredContracts(permits, requested))) {
      const permission = await this.#signPermit({ chunk, keypair, scope });
      permits.push(permission);
      await swallow("persist permit", () => this.#store.append(scope, [permission]));
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
  async isAllowed(contracts: readonly Address[], delegator?: Address): Promise<boolean> {
    if (contracts.length === 0) {
      return true;
    }
    const signerAddress = checksum(await this.#signer.getAddress());
    const keypair = await this.#vault.readStored(signerAddress);
    if (keypair === null) {
      return false;
    }
    const chainId = await this.#signer.getChainId();
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
   * @throws {@link SigningFailedError} if reading the signer address fails.
   */
  async revokePermits(contracts?: readonly Address[]): Promise<void> {
    const signerAddress = checksum(await this.#signer.getAddress());
    if (contracts === undefined) {
      await this.#store.clearAllForSigner(signerAddress);
      return;
    }
    const normalized = normalizeAddresses(contracts);
    if (normalized.length === 0) {
      return;
    }
    const chainId = await this.#signer.getChainId();
    await this.#store.deletePermitsTouching(
      { signerAddress, chainId, delegatorAddress: signerAddress },
      normalized,
    );
  }

  /**
   * Wipe the keypair for the current signer and cascade-delete every
   * permission referencing it across all chains and delegators.
   *
   * @throws {@link SigningFailedError} if reading the signer address fails.
   */
  async clearCredentials(): Promise<void> {
    const signerAddress = checksum(await this.#signer.getAddress());
    await this.#vault.clear(signerAddress);
    await this.#store.clearAllForSigner(signerAddress);
  }

  /**
   * Apply a wallet identity transition.
   *
   * Address change clears persisted credentials for the previous identity and
   * eagerly warms a keypair for the new one so the first decrypt does not stall
   * on key generation. Chain-only changes keep credentials intact because
   * permits are chain-scoped already and stale decrypt plaintext is cleared by
   * `ZamaSDK`.
   */
  async handleIdentityChange(
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
    if (nextAddr) {
      await swallow("warm keypair", async () => {
        await this.#vault.getOrCreate(nextAddr);
      });
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
