import type { ParseSignedDecryptionPermitReturnType as SignedDecryptionPermit } from "@fhevm/sdk/actions/chain";
import type { Address, Hex } from "viem";
import type { ChainRouter } from "../chains/router";
import { ZamaError } from "../errors/base";
import {
  KeyWrappingError,
  PreparedPermitChainMismatchError,
  PreparedPermitExpiredError,
  TransportKeyPairChangedError,
  UnifiedPermitNotSupportedError,
} from "../errors/credential";
import { ConfigurationError } from "../errors/relayer";
import { SignerNotConfiguredError } from "../errors/signer";
import { wrapSigningError } from "../errors/signing";
import type { ChecksummedAddress } from "../schemas/primitives";
import { checksum } from "../schemas/primitives";
import type { GenericLogger, GenericSigner, GenericStorage } from "../types";
import {
  isInvalidTransportKeyPairMessage,
  isUnsupportedUnifiedPermitMessage,
} from "../utils/error";
import { swallow } from "../utils/swallow";
import { parseSchema } from "../validation";
import { TransportKeyPairVault } from "./keypair-vault";
import type { DerivationSecretHolder } from "./keypair-wrapping";
import { PermissionStore } from "./permission-store";
import {
  chunkContracts,
  findPermitToWiden,
  isWildcardPermission,
  permissionCoversAny,
  sortedUnion,
  uncoveredContracts,
} from "./permissions";
import {
  Eip712Schema,
  PermitTTLSchema,
  PreparedPermitSchema,
  SerializedPermitSchema,
} from "./schemas";
import { permissionScopeKey, type PermissionScope } from "./storage-keys";
import type {
  Permission,
  PreparedPermit,
  PreparePermitRequest,
  SerializedTransportKeyPairWithPermissions,
  StoredTransportKeyPair,
} from "./types";
import {
  MAX_CONTRACTS_PER_PERMIT,
  normalizeAddresses,
  nowSeconds,
  SECONDS_PER_DAY,
  toJsonSafeEip712,
  WILDCARD_PERMIT,
  type WildcardPermit,
} from "./utils";

export const DEFAULT_TRANSPORT_KEY_PAIR_TTL_SECONDS = 30 * SECONDS_PER_DAY;
export const DEFAULT_PERMIT_DURATION_DAYS = 30;
/** How long a `canUseUnifiedDecryptionPermit` probe result is trusted before re-probing. */
export const UNIFIED_PERMIT_CACHE_TTL_SECONDS = SECONDS_PER_DAY;

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
  /**
   * Opt-in at-rest wrapping of the transport key pair's private half, for headless
   * contexts with no secure storage backend to delegate to. See
   * {@link TransportKeyPairVault}.
   */
  derivationSecret?: DerivationSecretHolder;
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
 *
 * @internal
 */
export class CredentialService {
  readonly #vault: TransportKeyPairVault;
  readonly #store: PermissionStore;
  readonly #router: ChainRouter;
  readonly #signer: GenericSigner | undefined;
  readonly #permitTTL: number;
  readonly #logger: GenericLogger;
  readonly #scope: string | undefined;
  /** In-flight revoked-context recoveries, one per permission scope. */
  readonly #permitRecoveries = new Map<string, Promise<void>>();
  /**
   * Per-chain cache of `canUseUnifiedDecryptionPermit`. A successful probe
   * (true or false) is reused for {@link UNIFIED_PERMIT_CACHE_TTL_SECONDS};
   * a thrown probe is not stored, so the next grant can retry.
   */
  readonly #unifiedPermitByChain = new Map<number, { supported: boolean; expiresAt: number }>();

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
      derivationSecret: config.derivationSecret,
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
   * Whether this chain's relayer supports unified (V2) decryption permits.
   * Cached per chain after a successful probe, for
   * {@link UNIFIED_PERMIT_CACHE_TTL_SECONDS}. A thrown probe is not stored,
   * so the next grant can retry — and must not block issuance (caller signs
   * V1 for that attempt). Never used for `WILDCARD_PERMIT` (always V2).
   */
  async #canUseUnifiedPermit(): Promise<boolean> {
    const chainId = this.#router.chain.id;
    const cached = this.#unifiedPermitByChain.get(chainId);
    if (cached !== undefined && nowSeconds() < cached.expiresAt) {
      return cached.supported;
    }
    try {
      const supported = await this.#router.relayer.canUseUnifiedDecryptionPermit();
      this.#unifiedPermitByChain.set(chainId, {
        supported,
        expiresAt: nowSeconds() + UNIFIED_PERMIT_CACHE_TTL_SECONDS,
      });
      return supported;
    } catch {
      return false;
    }
  }

  /**
   * Resolve a keypair and permissions covering `contracts`, minimizing wallet
   * prompts by reusing or widening existing permits where possible. Empty
   * `contracts` warms the keypair without prompting.
   *
   * Pass {@link WILDCARD_PERMIT} instead of an address list to request a V2
   * permissive permit covering every contract (`allowedContracts: []`) — an
   * explicit opt-in, never inferred from a large `contracts` list. Reuses an
   * existing valid wildcard permit in scope with no wallet prompt, same as a
   * covered address list.
   *
   * @returns The resolved keypair and permits covering the requested contracts.
   * @throws if the user rejects a wallet signature prompt. {@link SigningRejectedError}
   * @throws if signing fails for any other reason. {@link SigningFailedError}
   * @throws if `derivationSecret` is configured and the keypair fails to wrap or
   *   unwrap — see {@link TransportKeyPairVault.getOrCreate}. {@link KeyWrappingError}
   */
  async grantPermit(
    contracts: readonly Address[] | WildcardPermit,
    delegator?: Address,
  ): Promise<SerializedTransportKeyPairWithPermissions> {
    const signer = this.#requireSigner("grantPermit");
    const account = signer.requireWalletAccount("grantPermit");
    const signerAddress = checksum(account.address);

    if (contracts === WILDCARD_PERMIT) {
      const scope = this.#permissionScope(signerAddress, delegator);
      const keypair = await this.#vault.getOrCreate(signerAddress);
      const permissions = await this.#store.listUsableAndPrune(scope, keypair.publicKey);
      const existing = permissions.find(isWildcardPermission);
      if (existing) {
        return { keypair, permissions: [existing] };
      }
      const permission = await this.#signPermit({ version: 2, chunk: [], keypair, scope });
      await swallow("persist permit", () => this.#store.append(scope, [permission]), this.#logger);
      return { keypair, permissions: [permission] };
    }

    // Preserved exactly as before wildcard support was added: normalize (and
    // therefore validate) the address list before ever touching the vault.
    const requested = normalizeAddresses(contracts);
    const keypair = await this.#vault.getOrCreate(signerAddress);
    if (requested.length === 0) {
      return { keypair, permissions: [] };
    }

    const scope = this.#permissionScope(signerAddress, delegator);
    const permissions = await this.#store.listUsableAndPrune(scope, keypair.publicKey);

    const uncovered = uncoveredContracts(permissions, requested);
    if (uncovered.length > 0) {
      const candidate = findPermitToWiden(permissions, uncovered, requested);
      if (candidate !== null) {
        const version = (await this.#canUseUnifiedPermit()) ? 2 : 1;
        const widenedSet = sortedUnion(candidate.contractAddresses, uncovered);
        const widened = await this.#signPermit({ version, chunk: widenedSet, keypair, scope });
        await swallow(
          "replace permit",
          () => this.#store.replace(scope, candidate.serializedPermit.signature, widened),
          this.#logger,
        );
        permissions[permissions.indexOf(candidate)] = widened;
      } else {
        const version = (await this.#canUseUnifiedPermit()) ? 2 : 1;
        for (const chunk of chunkContracts(uncovered)) {
          const permission = await this.#signPermit({ version, chunk, keypair, scope });
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
      permissions: permissions.filter((p) => permissionCoversAny(p, requestedSet)),
    };
  }

  /**
   * Offline permit flow, phase 1: build the unsigned EIP-712 typed data for a
   * decryption permit without signing it. The caller (an HSM, custody API, or
   * any out-of-process signer) signs the returned `eip712` with
   * `eth_signTypedData_v4` and hands the signature to {@link registerPermit}.
   *
   * Signer-less: the transport key pair is resolved from `request.signer`
   * directly — no wallet account or configured signer needed. Signer-offline,
   * not network-offline: building the typed data still reads the chain's KMS
   * signers context on-chain.
   *
   * One permit per call — no widening or chunking against existing permits,
   * unlike {@link grantPermit}. Prefer `grantPermit` unless signing must
   * happen out-of-process.
   *
   * @throws if `request.contracts` is empty or exceeds {@link MAX_CONTRACTS_PER_PERMIT},
   *   `request.delegator` equals `request.signer`, or `request.durationDays` exceeds
   *   the V1 permit maximum of 365 days (enforced by `PermitTTLSchema`). {@link ConfigurationError}
   */
  async preparePermit(request: PreparePermitRequest): Promise<PreparedPermit> {
    const signerAddress = checksum(request.signer);
    const contracts = normalizeAddresses(request.contracts);
    if (contracts.length === 0) {
      throw new ConfigurationError("preparePermit: request.contracts must not be empty.");
    }
    if (contracts.length > MAX_CONTRACTS_PER_PERMIT) {
      throw new ConfigurationError(
        `preparePermit: request.contracts must not exceed ${MAX_CONTRACTS_PER_PERMIT} addresses per call ` +
          `(got ${contracts.length}) — grantPermit chunks automatically, preparePermit does not.`,
      );
    }
    const delegatorAddress = request.delegator ? checksum(request.delegator) : undefined;
    if (delegatorAddress !== undefined && delegatorAddress === signerAddress) {
      throw new ConfigurationError(
        "preparePermit: request.delegator must differ from request.signer — self-delegation is not allowed.",
      );
    }
    // PermitTTLSchema caps at MAX_V1_PERMIT_DURATION_DAYS, so an explicit
    // request.durationDays is bounded here, and the this.#permitTTL fallback
    // is bounded the same way at config-build time — no separate check needed.
    const durationDays =
      request.durationDays !== undefined
        ? parseSchema(PermitTTLSchema, request.durationDays)
        : this.#permitTTL;

    // Snapshot the relayer before the first await: a chain switch mid-flight
    // must not let the EIP-712 domain get built against a relayer bound to a
    // different chain than the one active when this call started.
    const relayer = this.#router.relayer;

    // Strict persistence: an out-of-process signing ceremony can take hours or
    // days, so a key pair that fails to persist here must fail immediately
    // instead of silently binding `eip712` to a key `registerPermit` will later
    // fail to find (surfacing only as a confusing `TransportKeyPairChangedError`
    // after the ceremony completes).
    const keypair = await this.#vault.getOrCreate(signerAddress, { strict: true });
    const transportKeyPair = await relayer.parseTransportKeyPair(keypair);
    const startTimestamp = nowSeconds();
    const eip712 = toJsonSafeEip712(
      Eip712Schema.parse(
        await relayer.createUnsignedLegacyDecryptionPermitEip712({
          transportKeyPair,
          contractAddresses: contracts,
          startTimestamp,
          durationSeconds: durationDays * SECONDS_PER_DAY,
          ...(delegatorAddress && { delegatorAddress }),
        }),
      ),
    );

    return { version: 1, eip712, signerAddress };
  }

  /**
   * Offline permit flow, phase 2: verify the signature an out-of-process
   * signer produced for a {@link preparePermit} payload, then persist it as a
   * usable permit.
   *
   * Idempotent: safe to call more than once for the same `(prepared, signature)`
   * pair (e.g. a webhook re-delivery, or a retried registration call) — the
   * second call replaces the first call's stored entry instead of duplicating it.
   *
   * Every field used below (chain, timing, transport key, contracts, delegation)
   * is read from `prepared.eip712` — the unsigned typed data — or, once verified,
   * from the signature-checked `signedPermit` the relayer returns. `preparePermit`
   * never hands back a separate "claimed" copy of any of these for this method to
   * cross-check against: there is exactly one source of truth for each field, so
   * there is nothing to tamper with independently of the signature itself.
   *
   * @throws if `prepared` doesn't match the {@link PreparedPermit} shape (e.g. it
   *   crossed a process boundary and was corrupted). {@link ConfigurationError}
   * @throws if the chain embedded in `prepared.eip712` doesn't match the currently
   *   active chain. {@link PreparedPermitChainMismatchError}
   * @throws if the permit's validity window has already elapsed. {@link PreparedPermitExpiredError}
   * @throws if no transport key pair is stored for `prepared.signerAddress`, or it no
   *   longer matches the public key `prepared.eip712` was built against (e.g. a TTL
   *   expiry or eviction in between). {@link TransportKeyPairChangedError}
   * @throws if the signature is invalid or malformed. {@link SigningFailedError}
   */
  async registerPermit(prepared: PreparedPermit, signature: Hex): Promise<void> {
    const parsed = parseSchema(PreparedPermitSchema, prepared);

    // Snapshot the relayer and chain together, before the first await — see the
    // identical guard in preparePermit.
    const relayer = this.#router.relayer;
    const activeChainId = this.#router.chain.id;

    const { domain, message } = parsed.eip712;
    const preparedChainId = Number(domain.chainId);
    if (preparedChainId !== activeChainId) {
      throw new PreparedPermitChainMismatchError({ preparedChainId, activeChainId });
    }
    const startTimestamp = Number(message.startTimestamp);
    const durationDays = Number(message.durationDays);
    if (nowSeconds() >= startTimestamp + durationDays * SECONDS_PER_DAY) {
      throw new PreparedPermitExpiredError(
        `registerPermit: the prepared permit's validity window (starting ${startTimestamp}, ` +
          `${durationDays}d) has already elapsed — call preparePermit again.`,
      );
    }

    // No key pair to fall back on generating here: `prepared.eip712` was built
    // against a specific transport public key, so a missing (or mismatched)
    // stored key pair can only mean it changed since preparePermit ran —
    // generating a fresh one via getOrCreate would just be discarded by the
    // comparison below, having wastefully persisted a key nothing will use.
    const signerAddress = parsed.signerAddress;
    const keypair = await this.#vault.readStored(signerAddress);
    if (keypair === null || keypair.publicKey !== message.publicKey) {
      throw new TransportKeyPairChangedError(
        "registerPermit: the transport key pair changed since preparePermit ran — call " +
          "preparePermit again to rebind the signature request to the current key pair.",
      );
    }

    const transportKeyPair = await relayer.parseTransportKeyPair(keypair);
    let signedPermit: SignedDecryptionPermit;
    try {
      signedPermit = await relayer.parseSignedDecryptionPermit({
        serializedPermit: {
          version: parsed.version,
          eip712: parsed.eip712,
          signature,
          signerAddress,
        },
        transportKeyPair,
      });
    } catch (error) {
      if (error instanceof ZamaError) {
        throw error;
      }
      throw wrapSigningError(error, "registerPermit: signature verification failed");
    }
    if (signedPermit.version !== 1) {
      throw new ConfigurationError(
        `registerPermit: expected a V1 signed permit, got version ${signedPermit.version}.`,
      );
    }

    const serializedPermit = SerializedPermitSchema.parse(
      await relayer.serializeSignedDecryptionPermit({ signedPermit }),
    );

    const permission: Permission = {
      version: 1,
      keypairPublicKey: keypair.publicKey,
      contractAddresses: normalizeAddresses(signedPermit.eip712.message.contractAddresses),
      serializedPermit,
      startTimestamp: Number(signedPermit.eip712.message.startTimestamp),
      durationDays: Number(signedPermit.eip712.message.durationDays),
    };
    const scope: PermissionScope = {
      signerAddress,
      chainId: activeChainId,
      delegatorAddress: checksum(signedPermit.encryptedDataOwnerAddress),
    };
    await this.#store.replace(scope, serializedPermit.signature, permission);
  }

  /**
   * Pure store lookup: are stored permits sufficient to cover `contracts`? No wallet prompt.
   *
   * Never throws on a `KeyWrappingError`: a stored keypair that fails to unwrap reports
   * no permit instead, since this is a read-only status check. `grantPermit()` still
   * surfaces that same failure normally.
   *
   * @returns `true` if cached permits cover all requested contracts (vacuously
   *   true for an empty list); `false` if no keypair exists, it fails to unwrap, or
   *   coverage is incomplete.
   * @throws if the backing storage read fails for a reason unrelated to `derivationSecret`
   *   wrapping: this is not swallowed, unlike a `KeyWrappingError`.
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
    let keypair: StoredTransportKeyPair | null;
    try {
      keypair = await this.#vault.readStored(signerAddress);
    } catch (error) {
      if (!(error instanceof KeyWrappingError)) {
        throw error;
      }
      // The vault already logged this failure; this read-only status check must not
      // surface it a second time as a rejection.
      return false;
    }
    if (keypair === null) {
      return false;
    }
    const scope = this.#permissionScope(signerAddress, delegator);
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
    await this.#store.deletePermitsTouching(this.#permissionScope(signerAddress), normalized);
  }

  /**
   * Permits are keyed by the router's active chain, the same chain their
   * EIP-712 domain is signed against, so the storage key and the signature
   * can never disagree.
   */
  #permissionScope(signerAddress: ChecksummedAddress, delegator?: Address): PermissionScope {
    return {
      signerAddress,
      chainId: this.#router.chain.id,
      delegatorAddress: delegator ? checksum(delegator) : signerAddress,
    };
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
   *
   * @throws if `derivationSecret` is configured and the keypair fails to wrap or
   *   unwrap — see {@link TransportKeyPairVault.getOrCreate}. {@link KeyWrappingError}
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
   * @throws if `derivationSecret` is configured and the keypair fails to wrap or
   *   unwrap — see {@link TransportKeyPairVault.getOrCreate}. {@link KeyWrappingError}
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
    version: 1 | 2;
    chunk: ChecksummedAddress[];
    keypair: StoredTransportKeyPair;
    scope: PermissionScope;
  }): Promise<Permission> {
    const { version, chunk, keypair, scope } = input;
    const startTimestamp = nowSeconds();
    const isDelegated = scope.delegatorAddress !== scope.signerAddress;
    const relayer = this.#router.relayer;
    try {
      const transportKeyPair = await relayer.parseTransportKeyPair(keypair);
      const durationSeconds = this.#permitTTL * SECONDS_PER_DAY;
      const permitInput = {
        transportKeyPair,
        contractAddresses: chunk,
        startTimestamp,
        durationSeconds,
        signerAddress: scope.signerAddress,
        signer: this.#requireSigner("signPermit"),
      };
      const sign =
        version === 2 ? relayer.signUnifiedDecryptionPermit : relayer.signDecryptionPermit;
      const signedPermit = await sign(
        isDelegated ? { ...permitInput, delegatorAddress: scope.delegatorAddress } : permitInput,
      );

      const serializedPermit = SerializedPermitSchema.parse(
        await relayer.serializeSignedDecryptionPermit({ signedPermit }),
      );

      return version === 2
        ? {
            version: 2,
            keypairPublicKey: keypair.publicKey,
            contractAddresses: chunk,
            serializedPermit,
            startTimestamp,
            durationSeconds,
          }
        : {
            version: 1,
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
      // The chain hasn't upgraded to protocol v0.14+ yet — @fhevm/sdk detects this
      // from the on-chain KMS context before ever requesting a signature. Surface
      // a typed, self-explanatory error instead of a generic signing failure.
      if (error instanceof Error && isUnsupportedUnifiedPermitMessage(error.message)) {
        throw new UnifiedPermitNotSupportedError(
          "grantPermit: V2 (unified) decryption permits — including wildcard permits — require " +
            "protocol v0.14 or later on this network. The connected chain hasn't upgraded yet " +
            "(or its ProtocolConfig contract address isn't configured on this FheChain). Grant a " +
            "V1 permit with an explicit contract list instead, or retry once the network upgrades.",
          { cause: error },
        );
      }
      // A key pair the relayer can't re-derive (post KMS/TKMS rotation) is
      // unusable: evict it so the next grantPermit regenerates a valid one, then
      // surface the typed InvalidTransportKeyPairError via wrapSigningError.
      if (error instanceof Error && isInvalidTransportKeyPairMessage(error.message)) {
        await this.#vault.evict(scope.signerAddress);
      }
      throw wrapSigningError(error, "Credential signing failed");
    }
  }

  /**
   * Evict the current signer's transport key pair so the next credential
   * resolution regenerates it — the self-heal hook the decrypt path calls when
   * the relayer rejects the stored key pair as invalid (see
   * {@link InvalidTransportKeyPairError}). No-op when no wallet is connected;
   * best-effort, never throws.
   */
  async evictTransportKeyPair(): Promise<void> {
    const account = this.#signer?.walletAccount.getSnapshot();
    if (!account) {
      return;
    }
    await this.#vault.evict(checksum(account.address));
  }

  /**
   * Recover the scope from a revoked KMS context: every permit in it was
   * signed under the dead context, so drop them all and re-sign the scope's
   * prior coverage plus `contracts` in one prompt, then resolve credentials as
   * {@link grantPermit} would. The self-heal hook the decrypt path calls on
   * {@link RevokedKmsContextError}; the key pair is untouched, only the
   * permits embed the dead context.
   *
   * Concurrent and repeated recoveries for the same scope cost at most one
   * wallet prompt: a running recovery is shared, and a call whose
   * `staleSignatures` are no longer stored re-signs nothing because the scope
   * was already recovered. If the stored permits cannot be read, nothing is
   * evicted and the stored (dead) permits are returned unchanged. If the
   * re-grant fails, the stored permits minus `staleSignatures` are put back
   * before the error propagates.
   *
   * @param staleSignatures Signatures of the permits the failed decrypt used.
   *   Omitted or empty makes recovery unconditional.
   * @throws if the user rejects the re-grant prompt. {@link SigningRejectedError}
   * @throws if re-signing fails for any other reason. {@link SigningFailedError}
   */
  async recoverPermits(
    contracts: readonly Address[],
    delegator?: Address,
    staleSignatures?: readonly Hex[],
  ): Promise<SerializedTransportKeyPairWithPermissions> {
    const signer = this.#requireSigner("recoverPermits");
    const account = signer.requireWalletAccount("recoverPermits");
    const scope = this.#permissionScope(checksum(account.address), delegator);
    const key = permissionScopeKey(scope);

    // A recovery for this scope is already running: wait for it instead of
    // starting another, no matter which permits this call failed with.
    const inFlight = this.#permitRecoveries.get(key);
    if (inFlight) {
      await inFlight;
      return this.grantPermit(contracts, delegator);
    }

    const stored = await this.#readScopePermits(scope);

    // A sibling recovery may have started while the read above was awaiting.
    // Check again: a sibling registers itself in the map before it clears the
    // store, so if the read saw a cleared store, the sibling is found here.
    const registered = this.#permitRecoveries.get(key);
    if (registered) {
      await registered;
      return this.grantPermit(contracts, delegator);
    }

    // The read failed: never clear a scope we could not read, or coverage we
    // cannot re-sign would be lost.
    if (stored === null) {
      return this.grantPermit(contracts, delegator);
    }

    const stale = new Set(staleSignatures ?? []);

    // None of the failing permits is stored anymore: another recovery already
    // replaced them. Retry with the fresh permit instead of re-signing.
    if (stale.size > 0 && !stored.some((p) => stale.has(p.serializedPermit.signature))) {
      return this.grantPermit(contracts, delegator);
    }

    const survivors = stored.filter((p) => !stale.has(p.serializedPermit.signature));
    const prior = stored.flatMap((p) => p.contractAddresses);
    const recovery = this.#clearAndRegrantScope(
      scope,
      prior,
      contracts,
      survivors,
      delegator,
    ).finally(() => {
      this.#permitRecoveries.delete(key);
    });
    // No `await` between the map re-check above and this `set`, so two callers
    // cannot both start a recovery for the same scope.
    this.#permitRecoveries.set(key, recovery);
    await recovery;
    // The union re-grant already covered `contracts`, so no extra prompt here.
    return this.grantPermit(contracts, delegator);
  }

  /** `null` marks a storage failure, distinct from an empty scope. */
  async #readScopePermits(scope: PermissionScope): Promise<Permission[] | null> {
    try {
      return await this.#store.list(scope);
    } catch (error) {
      this.#logger.warn("read permits for recovery failed", { error });
      return null;
    }
  }

  async #clearAndRegrantScope(
    scope: PermissionScope,
    prior: readonly ChecksummedAddress[],
    contracts: readonly Address[],
    survivors: readonly Permission[],
    delegator?: Address,
  ): Promise<void> {
    await swallow("evict revoked permits", () => this.#store.clearScope(scope), this.#logger);
    try {
      // Re-sign the union of what the scope covered, not just this call's
      // contracts: one signature restores every widened permit, so sibling
      // decrypt calls joining the recovery find their contracts already covered.
      await this.grantPermit(sortedUnion(prior, normalizeAddresses(contracts)), delegator);
    } catch (error) {
      // Coverage the session cannot re-sign must survive a failed re-grant.
      if (survivors.length > 0) {
        await swallow(
          "restore surviving permits",
          async () => {
            // A failed eviction leaves survivors stored: append only the missing ones.
            const current = await this.#store.list(scope);
            const present = new Set(current.map((p) => p.serializedPermit.signature));
            const missing = survivors.filter((p) => !present.has(p.serializedPermit.signature));
            if (missing.length > 0) {
              await this.#store.append(scope, missing);
            }
          },
          this.#logger,
        );
      }
      throw error;
    }
  }
}
