import { getAddress, type Address } from "viem";
import type { ZamaSDKEvent, ZamaSDKEventInput, ZamaSDKEventListener } from "../events/sdk-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { GenericStorage, SignerIdentity } from "../types";
import { ZamaError } from "../errors/base";
import { wrapSigningError } from "../errors/signing";
import { toError } from "../utils/error";
import { KeypairVault } from "./keypair-vault";
import {
  classifyPermissionCoverage,
  filterRelevantPermissions,
  unionSignedContracts,
} from "./permission-coverage";
import type { PermissionScope } from "./permission-store";
import { PermissionStore } from "./permission-store";
import { KeypairTTLSchema, PermitDurationSchema } from "./schemas";
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
/** Maximum keypairTTL accepted by the fhevm ACL contract (365 days, in seconds). */
const MAX_KEYPAIR_TTL_SECONDS = 365 * 86400;
export { KeypairTTLSchema, PermitDurationSchema };

/** Configuration for {@link CredentialService}. */
export interface CredentialServiceConfig {
  keypairGenerator: KeypairGenerator;
  permitFactory: PermitFactory;
  permitSigner: PermitSigner;
  /** Keypair lifetime in seconds. Default: 30 days. Capped at 365 days. */
  keypairTTL?: number;
  /** Permit lifetime in days. Default: 30. Clamped to `keypairTTL / 86400`. */
  permitDuration?: number;
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
  readonly #permitDurationDays: number;
  readonly #onEvent: ZamaSDKEventListener;
  readonly #pendingAllow = new Map<string, Promise<CredentialBundle>>();
  #identity: SignerIdentity | undefined;

  /** @throws {Error} if `keypairTTL` or `permitDuration` is not a positive integer. */
  constructor(config: CredentialServiceConfig) {
    const ttl = (() => {
      const value = KeypairTTLSchema.parse(config.keypairTTL ?? DEFAULT_KEYPAIR_TTL_SECONDS);
      if (value > MAX_KEYPAIR_TTL_SECONDS) {
        // oxlint-disable-next-line no-console
        console.warn(
          `[zama-sdk] keypairTTL (${value}s) exceeds the fhevm maximum of 365 days (${MAX_KEYPAIR_TTL_SECONDS}s); capping to ${MAX_KEYPAIR_TTL_SECONDS}s.`,
        );
        return MAX_KEYPAIR_TTL_SECONDS;
      }
      return value;
    })();

    const permitDuration = (() => {
      const requested = PermitDurationSchema.parse(
        config.permitDuration ?? DEFAULT_PERMIT_DURATION_DAYS,
      );
      const max = Math.floor(ttl / 86400);
      // Sub-day keypairTTL (test/dev): can't express the bound in whole days, skip clamping.
      if (max <= 0) {
        return requested;
      }
      if (requested > max) {
        // oxlint-disable-next-line no-console
        console.warn(
          `[zama-sdk] permitDuration (${requested}d) exceeds keypairTTL (${max}d); capping to ${max}d.`,
        );
        return max;
      }
      return requested;
    })();

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
    this.#permitDurationDays = permitDuration;
    this.#onEvent = config.onEvent ?? (() => {});
  }

  /** Eagerly resolve the current identity and warm the vault. Best-effort. */
  async initialize(): Promise<void> {
    try {
      const [address, chainId] = await Promise.all([
        this.#permitSigner.getAddress(),
        this.#permitSigner.getChainId(),
      ]);
      this.#identity = { address: getAddress(address), chainId };
      await this.#warmKeypairFor(getAddress(address));
    } catch (error) {
      // oxlint-disable-next-line no-console
      console.warn("[zama-sdk] CredentialService initialize failed:", error);
    }
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
      delegator,
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
    delegator?: Address;
    normalized: Address[];
  }): Promise<CredentialBundle> {
    const { signerAddress, chainId, delegatorAddress, delegator, normalized } = params;
    const scope: PermissionScope = { signerAddress, chainId, delegatorAddress };

    this.#emit({
      type: ZamaSDKEvents.CredentialsLoading,
      contractAddresses: normalized,
    });

    const keypair = await this.#vault.getOrCreate(signerAddress);
    const live = await this.#store.listUsableAndPrune(scope, keypair.publicKey);

    const coverage = classifyPermissionCoverage(live, normalized);

    if (coverage.type === "covered") {
      this.#emit({
        type: ZamaSDKEvents.CredentialsCached,
        contractAddresses: normalized,
      });
      this.#emit({
        type: ZamaSDKEvents.CredentialsAllowed,
        contractAddresses: normalized,
      });
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
        delegator,
      });
      signed.push(permission);

      try {
        await this.#store.append(scope, [permission]);
      } catch (error) {
        // oxlint-disable-next-line no-console
        console.warn("[zama-sdk] Failed to persist permit:", error);
        this.#emit({
          type: ZamaSDKEvents.CredentialsPersistFailed,
          error: toError(error),
        });
      }

      this.#emit({
        type: ZamaSDKEvents.CredentialsCreated,
        contractAddresses: permission.signedContractAddresses,
      });
    }

    const finalPermissions = [...live, ...signed];
    this.#emit({
      type: ZamaSDKEvents.CredentialsAllowed,
      contractAddresses: normalized,
    });
    return { keypair, permits: filterRelevantPermissions(finalPermissions, normalized) };
  }

  async #warmKeypairFor(signerAddress: Address): Promise<StoredKeypair> {
    return this.#vault.getOrCreate(signerAddress);
  }

  /**
   * Pure store lookup: are stored permits sufficient to cover `contracts`? No wallet prompt.
   *
   * @returns `true` if cached permits cover all requested contracts; `false` if no keypair exists
   *   or coverage is incomplete.
   */
  async isAllowed(contracts: Address[], delegator?: Address): Promise<boolean> {
    if (contracts.length === 0) {
      return false;
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
   * Wipe permissions for the current `(signer, chainId)` direct-decrypt scope.
   * Pass an explicit address list to delete every signed permit whose immutable
   * payload touches any of those addresses.
   *
   * @remarks
   * Operates on the direct-decrypt scope only. Delegated permissions are
   * untouched — use {@link clearCredentials} to wipe everything.
   *
   * @throws {@link SigningFailedError} if reading the signer address fails.
   */
  async revokePermits(contracts?: Address[]): Promise<void> {
    const signerAddress = getAddress(await this.#permitSigner.getAddress());
    const chainId = await this.#permitSigner.getChainId();
    const scope: PermissionScope = {
      signerAddress,
      chainId,
      delegatorAddress: signerAddress,
    };
    if (contracts === undefined) {
      await this.#store.clear(scope);
      this.#emit({ type: ZamaSDKEvents.CredentialsRevoked });
      return;
    }
    const normalized = normalizeAddresses(contracts);
    if (normalized.length === 0) {
      this.#emit({ type: ZamaSDKEvents.CredentialsRevoked, contractAddresses: normalized });
      return;
    }
    await this.#store.deletePermitsTouching(scope, normalized);
    this.#emit({ type: ZamaSDKEvents.CredentialsRevoked, contractAddresses: normalized });
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
    this.#emit({ type: ZamaSDKEvents.CredentialsRevoked });
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
        this.#emit({ type: ZamaSDKEvents.CredentialsRevoked });
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
    delegator?: Address;
  }): Promise<Permission> {
    const startTimestamp = Math.floor(Date.now() / 1000);
    const durationDays = this.#permitDurationDays;

    this.#emit({
      type: ZamaSDKEvents.CredentialsCreating,
      contractAddresses: input.chunk,
    });

    try {
      const eip712 = input.delegator
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

  #emit(input: ZamaSDKEventInput): void {
    try {
      this.#onEvent({ ...input, timestamp: Date.now() } as ZamaSDKEvent);
    } catch (error) {
      // oxlint-disable-next-line no-console
      console.error("[zama-sdk] credential event listener threw:", error);
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
