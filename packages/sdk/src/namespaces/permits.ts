import { getAddress, type Address } from "viem";
import type { SerializedTransportKeyPairWithPermissions } from "../credentials/types";
import { requireConfigured } from "../errors";
import type { GenericLogger, GenericProvider, GenericSigner } from "../types";
import { swallow } from "../utils";
import { requireAlignedWalletAccount, requireChainAlignment } from "../utils/alignment";

/**
 * Public namespace for permit and transport-key-pair management.
 *
 * Exposed as `sdk.permits`. Owns the SDK-level guards (chain alignment, empty-array
 * short-circuit, decrypt-cache invalidation) and delegates the actual work to the
 * internal credential service.
 *
 * The namespace is named `permits` because the user-facing concept is the signed-permit
 * store. The transport key pair is invisible plumbing — there is no `getTransportKeyPair()`
 * surfaced; the key pair exists to sign permits and is created automatically when needed.
 * {@link clear} wipes both the permit store and the transport key pair (permits
 * cascade-delete with the key pair).
 */
export class Permits {
  readonly #signer: GenericSigner | undefined;
  readonly #provider: GenericProvider;
  readonly #cachingService: { clearForRequester(requester: Address): Promise<void> };
  readonly #credentialService:
    | {
        grantPermit(
          contracts: readonly Address[],
          delegator?: Address,
        ): Promise<SerializedTransportKeyPairWithPermissions>;
        hasPermit(contracts: readonly Address[], delegator?: Address): Promise<boolean>;
        warmTransportKeyPair(address: Address): Promise<void>;
        revokePermits(contracts?: readonly Address[]): Promise<void>;
        clearCredentials(): Promise<void>;
      }
    | undefined;
  readonly #logger: GenericLogger;

  /** @internal */
  constructor(opts: {
    signer: GenericSigner | undefined;
    provider: GenericProvider;
    cachingService: { clearForRequester(requester: Address): Promise<void> };
    credentialService:
      | {
          grantPermit(
            contracts: readonly Address[],
            delegator?: Address,
          ): Promise<SerializedTransportKeyPairWithPermissions>;
          hasPermit(contracts: readonly Address[], delegator?: Address): Promise<boolean>;
          warmTransportKeyPair(address: Address): Promise<void>;
          revokePermits(contracts?: readonly Address[]): Promise<void>;
          clearCredentials(): Promise<void>;
        }
      | undefined;
    logger: GenericLogger;
  }) {
    this.#signer = opts.signer;
    this.#provider = opts.provider;
    this.#cachingService = opts.cachingService;
    this.#credentialService = opts.credentialService;
    this.#logger = opts.logger;
  }

  #requireCredentialService(operation: string) {
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
}
