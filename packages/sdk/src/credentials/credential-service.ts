import type { Address } from "viem";
import type { ChainRouter } from "../chains/router";
import { ZamaError } from "../errors/base";
import { ConfigurationError } from "../errors/relayer";
import { SignerNotConfiguredError } from "../errors/signer";
import { wrapSigningError } from "../errors/signing";
import type { ChecksummedAddress } from "../schemas/primitives";
import { checksum } from "../schemas/primitives";
import type { GenericLogger, GenericSigner, GenericStorage } from "../types";
import { swallow } from "../utils/swallow";
import { TransportKeyPairVault } from "./keypair-vault";
import { PermissionStore } from "./permission-store";
import { chunkContracts, findPermitToWiden, sortedUnion, uncoveredContracts } from "./permissions";
import { SerializedPermitSchema } from "./schemas";
import type { PermissionScope } from "./storage-keys";
import type {
  Permission,
  SerializedTransportKeyPairWithPermissions,
  StoredTransportKeyPair,
} from "./types";
import { normalizeAddresses, nowSeconds, SECONDS_PER_DAY } from "./utils";

export const DEFAULT_TRANSPORT_KEY_PAIR_TTL_SECONDS = 30 * SECONDS_PER_DAY;
export const DEFAULT_PERMIT_DURATION_DAYS = 30;

/** Configuration for {@link CredentialService}. TTLs are pre-validated by the caller. */
export interface CredentialServiceConfig {
  router: ChainRouter;
  /**
   * Optional signer. Required for {@link CredentialService.grantPermit},
   * {@link CredentialService.revokePermits}, and
   * {@link CredentialService.clearCredentials} — each throws
   * {@link SignerNotConfiguredError} without one. Omitted for signer-less
   * usage (public decryption / encryption, or construction before a wallet
   * connects). Deferred/custody signing is served by passing an
   * out-of-process signer here, not by a separate signer-less code path.
   */
  signer?: GenericSigner;
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
  /**
   * Opt-in shared-tenant scope (B2B2C/WaaS operators). When set, every signer
   * configured with the same scope shares one transport key pair instead of one
   * per signer address. Permits stay per-signer regardless — see
   * {@link revokeTransportKeyPair} for the operator-level counterpart to
   * signer-level revocation.
   */
  scope?: string;
}

/**
 * Single facade coordinating the keypair vault and the permission store.
 *
 * `CredentialService` is the only credentials object held by {@link ZamaSDK}. It accepts identity
 * transitions via `handleWalletAccountChange`.
 *
 * Two distinct revocation tiers exist and must not be conflated: {@link clearCredentials}
 * (signer-level, e.g. an end-user "disconnect") only ever removes that signer's own
 * key-pair slot and permits — when a scope is configured, the shared key pair was never
 * stored there, so it's untouched. {@link revokeTransportKeyPair} (operator-level) is
 * the only way to invalidate a scope's shared key pair, and it does so for every signer
 * in the scope at once.
 */
export class CredentialService {
  readonly #vault: TransportKeyPairVault;
  readonly #store: PermissionStore;
  readonly #router: ChainRouter;
  readonly #signer: GenericSigner | undefined;
  readonly #permitTTL: number;
  readonly #logger: GenericLogger;
  readonly #scope: string | undefined;

  constructor(config: CredentialServiceConfig) {
    this.#vault = new TransportKeyPairVault({
      generator: async () => {
        const relayer = config.router.relayer;
        const transportKeyPair = await relayer.generateTransportKeyPair();
        return relayer.serializeTransportKeyPair({ transportKeyPair });
      },
      storage: config.storage,
      ttl: config.transportKeyPairTTL,
      logger: config.logger,
      scope: config.scope,
    });
    this.#store = new PermissionStore({
      storage: config.permitStorage ?? config.storage,
      logger: config.logger,
    });
    this.#router = config.router;
    this.#signer = config.signer;
    this.#permitTTL = config.permitTTL;
    this.#logger = config.logger;
    this.#scope = config.scope;
  }

  #requireSigner(operation: string): GenericSigner {
    if (!this.#signer) {
      throw new SignerNotConfiguredError(operation);
    }
    return this.#signer;
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
  ): Promise<SerializedTransportKeyPairWithPermissions> {
    const signer = this.#requireSigner("grantPermit");
    const account = signer.requireWalletAccount("grantPermit");
    const signerAddress = checksum(account.address);
    const requested = normalizeAddresses(contracts);
    const keypair = await this.#vault.getOrCreate(signerAddress);
    if (requested.length === 0) {
      return { keypair, permissions: [] };
    }

    // Key permits by the router's active chain — the same source the permit's
    // EIP-712 domain is signed against (#signPermit uses this.#router.relayer) —
    // so the storage key and the signature can never disagree on the chain.
    const chainId = this.#router.chain.id;
    const scope: PermissionScope = {
      signerAddress,
      chainId,
      delegatorAddress: delegator ? checksum(delegator) : signerAddress,
    };
    const permissions = await this.#store.listUsableAndPrune(scope, keypair.publicKey);

    const uncovered = uncoveredContracts(permissions, requested);
    if (uncovered.length > 0) {
      const candidate = findPermitToWiden(permissions, uncovered, requested);
      if (candidate !== null) {
        const widenedSet = sortedUnion(candidate.contractAddresses, uncovered);
        const widened = await this.#signPermit({ chunk: widenedSet, keypair, scope });
        await swallow(
          "replace permit",
          () => this.#store.replace(scope, candidate.serializedPermit.signature, widened),
          this.#logger,
        );
        permissions[permissions.indexOf(candidate)] = widened;
      } else {
        for (const chunk of chunkContracts(uncovered)) {
          const permission = await this.#signPermit({ chunk, keypair, scope });
          permissions.push(permission);
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
      permissions: permissions.filter((p) => p.contractAddresses.some((a) => requestedSet.has(a))),
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
    const account = this.#signer?.walletAccount.getSnapshot();
    if (!account) {
      return false;
    }
    const signerAddress = checksum(account.address);
    const keypair = await this.#vault.readStored(signerAddress);
    if (keypair === null) {
      return false;
    }
    const chainId = this.#router.chain.id;
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
    const signer = this.#requireSigner("revokePermits");
    const account = signer.requireWalletAccount("revokePermits");
    const signerAddress = checksum(account.address);
    if (contracts === undefined) {
      await this.#store.clearAllForSigner(signerAddress);
      return;
    }
    const normalized = normalizeAddresses(contracts);
    if (normalized.length === 0) {
      return;
    }
    const chainId = this.#router.chain.id;
    await this.#store.deletePermitsTouching(
      { signerAddress, chainId, delegatorAddress: signerAddress },
      normalized,
    );
  }

  /**
   * Wipe the keypair for the current signer and cascade-delete every
   * permission referencing it across all chains and delegators.
   *
   * Signer-level only: when a scope is configured, the shared key pair was never
   * stored under this signer's own slot, so it survives untouched — only this
   * signer's permits are removed. Use {@link revokeTransportKeyPair} to invalidate
   * the shared key pair itself.
   *
   * @throws if reading the signer address fails. {@link SigningFailedError}
   */
  async clearCredentials(): Promise<void> {
    const signer = this.#requireSigner("clearCredentials");
    const account = signer.requireWalletAccount("clearCredentials");
    const signerAddress = checksum(account.address);
    await this.#vault.clear(signerAddress);
    await this.#store.clearAllForSigner(signerAddress);
  }

  /**
   * Revoke this scope's shared transport key pair (operator-level action).
   *
   * Deletes the shared key pair. Every permit signed under it embeds the old
   * public key, so `listUsableAndPrune` treats them all as stale on next access —
   * no permit is touched directly, and no connected wallet is required. This is
   * the only operation that can invalidate a shared key pair; signer-level
   * {@link clearCredentials} never does.
   *
   * Not best-effort: unlike {@link clearCredentials}, a storage failure here rejects
   * instead of being logged and swallowed — see {@link TransportKeyPairVault.clearScope}.
   *
   * Only stops the SDK from reissuing or reusing the deleted key going forward — does
   * not revoke any permit already issued under it. A permit is a self-contained,
   * bearer-style EIP-712 signature the relayer accepts independently of this SDK's
   * storage; one already exfiltrated alongside the key remains usable until its own
   * `permitTTL` expiry regardless of this call.
   *
   * @param scopeId - Must match the scope this service was configured with. Requiring
   *   the caller to name it guards against revoking the wrong scope by mistake.
   * @throws if no scope is configured, or `scopeId` doesn't match it. {@link ConfigurationError}
   * @throws if the underlying storage delete fails.
   */
  async revokeTransportKeyPair(scopeId: string): Promise<void> {
    if (this.#scope === undefined) {
      throw new ConfigurationError(
        "revokeTransportKeyPair() requires a transportKeyPairScope to be configured on this SDK instance — there is no shared key pair to revoke.",
      );
    }
    if (scopeId !== this.#scope) {
      throw new ConfigurationError(
        `revokeTransportKeyPair("${scopeId}") does not match the configured scope ("${this.#scope}").`,
      );
    }
    await this.#vault.clearScope();
  }

  /**
   * Warm the signer transport key pair cache for a known address.
   *
   * Best-effort prefetch primitive: correctness still comes from `grantPermit`,
   * which lazily creates the transport key pair when needed. Errors (storage failure,
   * relayer 4xx, missing Worker in SSR) are **not** swallowed here — the caller
   * decides whether to log, ignore, or surface them.
   *
   * Not for pre-warming a shared scope: `address` is ignored for storage keying once
   * a scope is configured (see {@link TransportKeyPairVault}), so this call's actual
   * effect wouldn't match its apparent per-signer intent. Use
   * {@link warmTransportKeyPairScope} instead.
   */
  async warmTransportKeyPair(address: Address): Promise<void> {
    await this.#vault.getOrCreate(checksum(address));
  }

  /**
   * Warm this scope's shared transport key pair (operator-level, no wallet needed) —
   * the pre-warm counterpart to {@link revokeTransportKeyPair}.
   *
   * @param scopeId - Must match the scope this service was configured with. Requiring
   *   the caller to name it guards against warming the wrong scope by mistake.
   * @throws if no scope is configured, or `scopeId` doesn't match it. {@link ConfigurationError}
   */
  async warmTransportKeyPairScope(scopeId: string): Promise<void> {
    if (this.#scope === undefined) {
      throw new ConfigurationError(
        "warmTransportKeyPairScope() requires a transportKeyPairScope to be configured on this SDK instance — there is no shared key pair to warm.",
      );
    }
    if (scopeId !== this.#scope) {
      throw new ConfigurationError(
        `warmTransportKeyPairScope("${scopeId}") does not match the configured scope ("${this.#scope}").`,
      );
    }
    await this.#vault.warmScope();
  }

  /**
   * Apply a wallet account transition.
   *
   * Address change clears persisted credentials for the previous account.
   * Chain-only changes keep credentials intact because permits are chain-scoped
   * already and stale decrypt plaintext is cleared by {@link ZamaSDK}.
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
    const relayer = this.#router.relayer;
    try {
      const transportKeyPair = await relayer.parseTransportKeyPair({
        publicKey: keypair.publicKey,
        privateKey: keypair.privateKey,
      });
      const permitInput = {
        transportKeyPair,
        contractAddresses: chunk,
        startTimestamp,
        durationSeconds: this.#permitTTL * SECONDS_PER_DAY,
        signerAddress: scope.signerAddress,
        signer: this.#requireSigner("signPermit"),
      };
      const signedPermit = isDelegated
        ? await relayer.signDecryptionPermit({
            ...permitInput,
            delegatorAddress: scope.delegatorAddress,
          })
        : await relayer.signDecryptionPermit(permitInput);

      const serializedPermit = SerializedPermitSchema.parse(
        relayer.serializeSignedDecryptionPermit({ signedPermit }),
      );

      return {
        keypairPublicKey: keypair.publicKey,
        contractAddresses: chunk,
        serializedPermit,
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
