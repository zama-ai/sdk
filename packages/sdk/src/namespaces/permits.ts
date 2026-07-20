import { getAddress, type Address } from "viem";
import type { CredentialService } from "../credentials/credential-service";
import { requireConfigured } from "../errors";
import type { CachingService } from "../services/caching-service";
import type { GenericLogger, GenericProvider, GenericSigner } from "../types";
import { swallow } from "../utils";
import { requireAlignedWalletAccount, requireChainAlignment } from "../utils/alignment";

/**
 * Public namespace for permit and transport-key-pair management.
 *
 * Exposed as `sdk.permits`. Owns the SDK-level guards (chain alignment, empty-array
 * short-circuit, decrypt-cache invalidation) and delegates the actual work to the
 * internal {@link CredentialService}.
 *
 * The namespace is named `permits` because the user-facing concept is the signed-permit
 * store. The transport key pair is invisible plumbing — there is no `getTransportKeyPair()`
 * surfaced; the key pair exists to sign permits and is created automatically when needed.
 * {@link clear} wipes both the permit store and the transport key pair (permits
 * cascade-delete with the key pair).
 *
 * When `transportKeyPairScope` is configured (opt-in shared-tenant scope for B2B2C/WaaS
 * operators), {@link clear} and {@link revokePermits} stay signer-level only — they never
 * touch the shared key pair. {@link revokeTransportKeyPair} is the distinct,
 * operator-level operation for that.
 */
export class Permits {
  readonly #signer: GenericSigner | undefined;
  readonly #provider: GenericProvider;
  readonly #cachingService: CachingService;
  readonly #credentialService: CredentialService | undefined;
  readonly #logger: GenericLogger;

  /** @internal */
  constructor(opts: {
    signer: GenericSigner | undefined;
    provider: GenericProvider;
    cachingService: CachingService;
    credentialService: CredentialService | undefined;
    logger: GenericLogger;
  }) {
    this.#signer = opts.signer;
    this.#provider = opts.provider;
    this.#cachingService = opts.cachingService;
    this.#credentialService = opts.credentialService;
    this.#logger = opts.logger;
  }

  #requireCredentialService(operation: string): CredentialService {
    return requireConfigured(this.#credentialService, operation);
  }

  /**
   * Sign and store an EIP-712 permit authorising direct decryption for the
   * given contract addresses.
   *
   * Idempotent: if a permit covering the requested set already exists, no
   * wallet prompt occurs. Otherwise the SDK chunks the uncovered subset into
   * groups of ≤10 contracts and prompts once per chunk; partial mid-flight
   * rejection is preserved (already-signed chunks are persisted before the
   * next prompt).
   *
   * @param contracts - Contract addresses to authorize.
   */
  async grantPermit(contracts: Address[]): Promise<void> {
    if (contracts.length === 0) {
      return;
    }
    const service = this.#requireCredentialService("grantPermit");
    await requireChainAlignment("grantPermit", this.#signer, this.#provider);
    await service.grantPermit(contracts);
  }

  /**
   * Sign and store an EIP-712 delegation permit authorising decryption on
   * behalf of `delegator`. Same idempotence/chunking semantics as {@link grantPermit}.
   *
   * @param delegator - The address that delegated decryption rights to the connected signer.
   * @param contracts - Contract addresses to authorize.
   */
  async grantDelegationPermit(delegator: Address, contracts: Address[]): Promise<void> {
    if (contracts.length === 0) {
      return;
    }
    const service = this.#requireCredentialService("grantDelegationPermit");
    await requireChainAlignment("grantDelegationPermit", this.#signer, this.#provider);
    await service.grantPermit(contracts, delegator);
  }

  /**
   * Pure store lookup: is there a permit covering `contracts`?
   * No wallet prompt, no transport key pair generation. Returns `false` when no signer
   * is configured.
   */
  async hasPermit(contracts: Address[]): Promise<boolean> {
    if (!this.#credentialService) {
      return false;
    }
    return this.#credentialService.hasPermit(contracts);
  }

  /**
   * Pure store lookup for a delegation permit. See {@link hasPermit}.
   *
   * @param delegator - The address that delegated decryption rights to the connected signer.
   * @param contracts - Contract addresses to check.
   * @returns `true` if cached delegation permits cover all requested contracts.
   */
  async hasDelegationPermit(delegator: Address, contracts: Address[]): Promise<boolean> {
    if (!this.#credentialService) {
      return false;
    }
    return this.#credentialService.hasPermit(contracts, delegator);
  }

  /**
   * Best-effort transport-key-pair prefetch for the connected signer.
   *
   * Optional latency optimization: decrypt and permit flows remain correct
   * without it because they lazily create the transport key pair when needed.
   *
   * Silent no-op when no signer is configured or no wallet account is
   * available. The transport key pair is generated through the relayer dispatcher's
   * currently active chain — see {@link LifecycleService}, which calls
   * `switchChain` before fanning the wallet-account change out to listeners,
   * so any downstream caller (including React adapters) observes the
   * dispatcher on the wallet chain by the time it invokes warmup.
   *
   * Not for pre-warming a shared `transportKeyPairScope`: this call's wallet-account
   * precondition doesn't conceptually apply to a scope-wide key, and would silently
   * no-op precisely when an operator is most likely to be calling it (no end-user
   * connected yet). Use {@link warmTransportKeyPairScope} instead.
   */
  async warmTransportKeyPair(): Promise<void> {
    const service = this.#credentialService;
    if (!service) {
      return;
    }
    const account = this.#signer?.walletAccount.getSnapshot();
    if (!account) {
      return;
    }
    await service.warmTransportKeyPair(account.address);
  }

  /**
   * Wipe FHE permits for the current signer.
   *
   * - With no argument: every permit referencing this signer is removed across
   *   all chains and delegators. The transport key pair survives — use {@link clear} to
   *   also wipe the transport key pair.
   * - With a contract list: every signed permit in the direct-decrypt scope
   *   (current chain) whose immutable payload touches any listed address is
   *   removed. Delegation permits are not touched in this mode.
   *
   * @throws if no signer is configured. {@link SignerNotConfiguredError}
   */
  async revokePermits(contracts?: Address[]): Promise<void> {
    const service = this.#requireCredentialService("revokePermits");
    const account = await requireAlignedWalletAccount(
      "revokePermits",
      this.#signer,
      this.#provider,
    );
    const signerAddress = getAddress(account.address);
    try {
      await service.revokePermits(contracts);
    } finally {
      await swallow(
        "clear decrypt cache",
        () => this.#cachingService.clearForRequester(signerAddress),
        this.#logger,
      );
    }
  }

  /**
   * Wipe the transport key pair for the current signer and cascade-delete every permit
   * (across chains and delegators) referencing it.
   *
   * @throws if no signer is configured. {@link SignerNotConfiguredError}
   */
  async clear(): Promise<void> {
    const service = this.#requireCredentialService("clear");
    const account = await requireAlignedWalletAccount("clear", this.#signer, this.#provider);
    const signerAddress = getAddress(account.address);
    try {
      await service.clearCredentials();
    } finally {
      await swallow(
        "clear decrypt cache",
        () => this.#cachingService.clearForRequester(signerAddress),
        this.#logger,
      );
    }
  }

  /**
   * Revoke the shared transport key pair for `transportKeyPairScope` (operator-level
   * action — no wallet account needs to be connected, but a signer must still be
   * configured on this SDK instance at construction time).
   *
   * Deletes the shared key pair; every permit in the scope embeds its public key, so
   * they're all treated as stale on next access. Signer-level {@link clear} never does
   * this — it only ever wipes the calling signer's own permits.
   *
   * Not best-effort, unlike most credential-store writes: a storage failure rejects
   * instead of being logged and swallowed. This is the primitive an operator reaches
   * for on suspected key compromise — a resolved promise must mean the key pair is
   * actually gone.
   *
   * Stops the SDK from reissuing or reusing the deleted key — does not revoke any
   * permit already issued under it. A permit is a self-contained, bearer-style EIP-712
   * signature the relayer accepts independently of this SDK; one exfiltrated alongside
   * the key remains usable until its own `permitTTL` expiry regardless of this call.
   *
   * @param scopeId - Must match the configured `transportKeyPairScope`, as a guard
   *   against revoking the wrong scope by mistake.
   * @throws if no signer is configured. {@link SignerNotConfiguredError}
   * @throws if no scope is configured, or `scopeId` doesn't match it. {@link ConfigurationError}
   * @throws if the underlying storage delete fails.
   */
  async revokeTransportKeyPair(scopeId: string): Promise<void> {
    const service = this.#requireCredentialService("revokeTransportKeyPair");
    await service.revokeTransportKeyPair(scopeId);
  }

  /**
   * Warm the shared transport key pair for `transportKeyPairScope` (operator-level —
   * no wallet account needs to be connected, but a signer must still be configured on
   * this SDK instance at construction time) — the pre-warm counterpart to
   * {@link revokeTransportKeyPair}. Prefer this over {@link warmTransportKeyPair} for a
   * scoped key pair: unlike that method, this never silently no-ops for lack of a
   * connected wallet, because a scope-wide key was never tied to one in the first place.
   *
   * @param scopeId - Must match the configured `transportKeyPairScope`, as a guard
   *   against warming the wrong scope by mistake.
   * @throws if no signer is configured. {@link SignerNotConfiguredError}
   * @throws if no scope is configured, or `scopeId` doesn't match it. {@link ConfigurationError}
   */
  async warmTransportKeyPairScope(scopeId: string): Promise<void> {
    const service = this.#requireCredentialService("warmTransportKeyPairScope");
    await service.warmTransportKeyPairScope(scopeId);
  }
}
