import { getAddress, type Address } from "viem";
import type { ZamaSDKEventListener } from "../events/sdk-events";
import type { GenericStorage, SignerIdentity } from "../types";
import { ZamaError } from "../errors/base";
import { wrapSigningError } from "../errors/signing";
import { KeypairVault } from "./keypair-vault";
import {
  classifyPermissionCoverage,
  filterRelevantPermissions,
  unionSignedContracts,
} from "./permission-coverage";
import type { PermissionScope } from "./permission-store";
import { PermissionStore } from "./permission-store";
import { KeypairTTLSchema, PermitTTLSchema } from "./schemas";
import type {
  CredentialBundle,
  KeypairGenerator,
  Permission,
  PermitFactory,
  PermitSigner,
  StoredKeypair,
} from "./types";
import { coversContracts, normalizeAddresses } from "./utils";

const DEFAULT_KEYPAIR_TTL_SECONDS = 30 * 86400;
const DEFAULT_PERMIT_DURATION_DAYS = 30;
export { KeypairTTLSchema, PermitTTLSchema };

/** Configuration for {@link CredentialService}. */
export interface CredentialServiceConfig {
  keypairGenerator: KeypairGenerator;
  permitFactory: PermitFactory;
  permitSigner: PermitSigner;
  /** Keypair lifetime in seconds. Default: 30 days. Must not exceed 365 days. */
  keypairTTL?: number;
  /** Permit lifetime in days. Default: 30. */
  permitTTL?: number;
  /** Backing storage for keypairs (and permits if `permitStorage` is omitted). */
  storage: GenericStorage;
  /** Optional dedicated storage for permits; defaults to `storage`. */
  permitStorage?: GenericStorage;
  /** Optional structured event listener for debugging and telemetry. Never receives sensitive data. */
  onEvent?: ZamaSDKEventListener;
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
  readonly #permitFactory: PermitFactory;
  readonly #permitSigner: PermitSigner;
  readonly #permitTTLDays: number;
  readonly #pendingAllow = new Map<string, Promise<CredentialBundle>>();
  #identity: SignerIdentity | undefined;

  /**
   * @throws {ZodError} if `keypairTTL` or `permitTTL` is not a positive integer,
   *   or if `keypairTTL` exceeds the fhevm ACL maximum of 365 days.
   * @throws {ConfigurationError} if `permitTTL` (days) exceeds `keypairTTL / 86400`.
   */
  constructor(config: CredentialServiceConfig) {
    const ttl = KeypairTTLSchema.parse(config.keypairTTL ?? DEFAULT_KEYPAIR_TTL_SECONDS);
    const permitTTL = PermitTTLSchema.parse(config.permitTTL ?? DEFAULT_PERMIT_DURATION_DAYS);

    this.#vault = new KeypairVault({
      generator: config.keypairGenerator,
      storage: config.storage,
      ttl,
    });
    this.#store = new PermissionStore({
      storage: config.permitStorage ?? config.storage,
    });
    this.#permitFactory = config.permitFactory;
    this.#permitSigner = config.permitSigner;
    this.#permitTTLDays = permitTTL;
  }

  /** Eagerly resolve the current identity and warm the vault. Best-effort. */
  async initialize(): Promise<void> {
    const [address, chainId] = await Promise.all([
      this.#permitSigner.getAddress(),
      this.#permitSigner.getChainId(),
    ]);
    this.#identity = { address: getAddress(address), chainId };
    await this.#warmKeypairFor(getAddress(address));
  }

  /** Warm the current signer's keypair without creating any signed permits. */
  async warmKeypair(): Promise<StoredKeypair> {
    return this.#warmKeypairFor(getAddress(await this.#permitSigner.getAddress()));
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
    const signerAddress = getAddress(await this.#permitSigner.getAddress());
    const chainId = await this.#permitSigner.getChainId();
    const delegatorAddress = delegator ? getAddress(delegator) : signerAddress;
    const normalized = normalizeAddresses(contracts);
    if (normalized.length === 0) {
      return {
        keypair: await this.#warmKeypairFor(signerAddress),
        permits: [],
      };
    }

    const dedupKey = allowDedupKey({
      signerAddress,
      chainId,
      delegatorAddress,
      contracts: normalized,
    });
    const inflight = this.#pendingAllow.get(dedupKey);
    if (inflight) {
      return inflight;
    }

    const promise = this.#runAllow({
      signerAddress,
      chainId,
      delegatorAddress,
      normalized,
    }).finally(() => {
      this.#pendingAllow.delete(dedupKey);
    });
    this.#pendingAllow.set(dedupKey, promise);
    return promise;
  }

  async #runAllow(params: {
    signerAddress: Address;
    chainId: number;
    delegatorAddress: Address;
    normalized: Address[];
  }): Promise<CredentialBundle> {
    const { signerAddress, chainId, delegatorAddress, normalized } = params;
    const scope: PermissionScope = { signerAddress, chainId, delegatorAddress };

    const keypair = await this.#vault.getOrCreate(signerAddress);
    const live = await this.#store.listUsableAndPrune(scope, keypair.publicKey);

    const coverage = classifyPermissionCoverage(live, normalized);

    if (coverage.type === "covered") {
      return { keypair, permits: coverage.permissions };
    }

    const signed: Permission[] = [];
    for (const chunk of coverage.uncoveredChunks) {
      const permission = await this.#signPermit({
        chunk,
        keypair,
        signerAddress,
        chainId,
        delegatorAddress,
      });
      signed.push(permission);

      try {
        await this.#store.append(scope, [permission]);
      } catch (error) {
        // oxlint-disable-next-line no-console
        console.warn("[zama-sdk] Failed to persist permit:", error);
      }
    }

    const finalPermissions = [...live, ...signed];
    return { keypair, permits: filterRelevantPermissions(finalPermissions, normalized) };
  }

  async #warmKeypairFor(signerAddress: Address): Promise<StoredKeypair> {
    return this.#vault.getOrCreate(signerAddress);
  }

  /**
   * Pure store lookup: are stored permits sufficient to cover `contracts`? No wallet prompt.
   *
   * @returns `true` if cached permits cover all requested contracts (vacuously
   *   true for an empty list); `false` if no keypair exists or coverage is
   *   incomplete.
   */
  async isAllowed(contracts: Address[], delegator?: Address): Promise<boolean> {
    if (contracts.length === 0) {
      return true;
    }
    const signerAddress = getAddress(await this.#permitSigner.getAddress());
    const chainId = await this.#permitSigner.getChainId();
    const delegatorAddress = delegator ? getAddress(delegator) : signerAddress;
    const keypair = await this.#vault.readStored(signerAddress);
    if (keypair === null) {
      return false;
    }
    const scope: PermissionScope = { signerAddress, chainId, delegatorAddress };
    const matching = await this.#store.listUsableAndPrune(scope, keypair.publicKey);
    const normalized = normalizeAddresses(contracts);
    return coversContracts(unionSignedContracts(matching), normalized);
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
  async revokePermits(contracts?: Address[]): Promise<void> {
    const signerAddress = getAddress(await this.#permitSigner.getAddress());
    if (contracts === undefined) {
      await this.#store.clearAllForSigner(signerAddress);
      return;
    }
    const normalized = normalizeAddresses(contracts);
    if (normalized.length === 0) {
      return;
    }
    const chainId = await this.#permitSigner.getChainId();
    const scope: PermissionScope = {
      signerAddress,
      chainId,
      delegatorAddress: signerAddress,
    };
    await this.#store.deletePermitsTouching(scope, normalized);
  }

  /**
   * Wipe the keypair for the current signer and cascade-delete every
   * permission referencing it across all chains and delegators.
   *
   * @throws {@link SigningFailedError} if reading the signer address fails.
   */
  async clearCredentials(): Promise<void> {
    const signerAddress = getAddress(await this.#permitSigner.getAddress());
    await this.#vault.clear(signerAddress);
    await this.#store.clearAllForSigner(signerAddress);
  }

  /**
   * Apply a wallet identity transition.
   *
   * Address change clears persisted credentials for the previous identity.
   * Chain-only changes keep credentials intact because permits are chain-scoped
   * already and stale decrypt plaintext is cleared by `ZamaSDK`.
   */
  async handleIdentityChange(prev?: SignerIdentity, next?: SignerIdentity): Promise<void> {
    const prevAddr = prev ? getAddress(prev.address) : undefined;
    const nextAddr = next ? getAddress(next.address) : undefined;
    if (prevAddr !== nextAddr && prevAddr) {
      try {
        await this.#vault.clear(prevAddr);
        await this.#store.clearAllForSigner(prevAddr);
      } catch (error) {
        // oxlint-disable-next-line no-console
        console.warn("[zama-sdk] cascade-clear for prev identity failed:", error);
      }
    }
    this.#identity = next;
  }

  /** Cached identity snapshot, set by `handleIdentityChange` / `initialize`. */
  get currentIdentity(): SignerIdentity | undefined {
    return this.#identity;
  }

  async #signPermit(input: {
    chunk: Address[];
    keypair: StoredKeypair;
    signerAddress: Address;
    chainId: number;
    delegatorAddress: Address;
  }): Promise<Permission> {
    const startTimestamp = Math.floor(Date.now() / 1000);
    const durationDays = this.#permitTTLDays;
    const isDelegated = input.delegatorAddress !== input.signerAddress;

    try {
      const eip712 = isDelegated
        ? await this.#permitFactory.createDelegatedUserDecryptEIP712(
            input.keypair.publicKey,
            input.chunk,
            input.delegatorAddress,
            startTimestamp,
            durationDays,
          )
        : await this.#permitFactory.createEIP712(
            input.keypair.publicKey,
            input.chunk,
            startTimestamp,
            durationDays,
          );

      const signature = await this.#permitSigner.signTypedData(eip712);

      return {
        keypairPublicKey: input.keypair.publicKey,
        signerAddress: input.signerAddress,
        delegatorAddress: input.delegatorAddress,
        chainId: input.chainId,
        signedContractAddresses: input.chunk,
        signature,
        startTimestamp,
        durationDays,
      };
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      return wrapSigningError(error, "Credential signing failed");
    }
  }
}

function allowDedupKey(input: {
  signerAddress: Address;
  chainId: number;
  delegatorAddress: Address;
  contracts: Address[];
}): string {
  return [
    getAddress(input.signerAddress),
    input.chainId,
    getAddress(input.delegatorAddress),
    ...input.contracts,
  ].join(":");
}
