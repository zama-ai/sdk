import { getAddress, type Address } from "viem";
import { buildAllowAsIntent, buildAllowIntent, type ClearSigningIntent } from "../clear-signing";
import type { CredentialService } from "../credentials/credential-service";
import { requireConfigured } from "../errors";
import type { CachingService } from "../services/caching-service";
import type { ClearSigningCallbacks, GenericProvider, GenericSigner } from "../types";
import { swallow } from "../utils";
import { requireAlignedWalletAccount, requireChainAlignment } from "../utils/alignment";

/**
 * Public namespace for permit and keypair management.
 *
 * Exposed as `sdk.permits`. Owns the SDK-level guards (chain alignment, empty-array
 * short-circuit, decrypt-cache invalidation) and delegates the actual work to the
 * internal {@link CredentialService}.
 *
 * The namespace is named `permits` because the user-facing concept is the signed-permit
 * store. The FHE keypair is invisible plumbing — there is no `getKeypair()` surfaced;
 * the keypair exists to sign permits and is created automatically when needed.
 * {@link clear} wipes both the permit store and the keypair (permits cascade-delete
 * with the keypair).
 */
export class Permits {
  readonly #signer: GenericSigner | undefined;
  readonly #provider: GenericProvider;
  readonly #cachingService: CachingService;
  readonly #credentialService: CredentialService | undefined;

  /** @internal */
  constructor(opts: {
    signer: GenericSigner | undefined;
    provider: GenericProvider;
    cachingService: CachingService;
    credentialService: CredentialService | undefined;
  }) {
    this.#signer = opts.signer;
    this.#provider = opts.provider;
    this.#cachingService = opts.cachingService;
    this.#credentialService = opts.credentialService;
  }

  #requireCredentialService(operation: string): CredentialService {
    return requireConfigured(this.#credentialService, operation);
  }

  /** Build a clear-signing preview for direct decrypt authorization. */
  async createAllowClearSigningIntent(contracts: Address[]): Promise<ClearSigningIntent> {
    return buildAllowIntent({
      contractAddresses: contracts.map((contract) => getAddress(contract)),
      chainId: await this.#provider.getChainId(),
    });
  }

  /** Build a clear-signing preview for delegated decrypt credential authorization. */
  async createAllowAsClearSigningIntent(
    delegator: Address,
    contracts: Address[],
  ): Promise<ClearSigningIntent> {
    return buildAllowAsIntent({
      delegatorAddress: getAddress(delegator),
      contractAddresses: contracts.map((contract) => getAddress(contract)),
      chainId: await this.#provider.getChainId(),
    });
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
  async grantPermit(contracts: Address[], options?: ClearSigningCallbacks): Promise<void> {
    if (contracts.length === 0) {
      return;
    }
    const service = this.#requireCredentialService("grantPermit");
    await requireChainAlignment("grantPermit", this.#signer, this.#provider);
    await service.grantPermit(contracts, undefined, options);
  }

  /**
   * Sign and store an EIP-712 delegation permit authorising decryption on
   * behalf of `delegator`. Same idempotence/chunking semantics as {@link grantPermit}.
   *
   * @param delegator - The address that delegated decryption rights to the connected signer.
   * @param contracts - Contract addresses to authorize.
   */
  async grantDelegationPermit(
    delegator: Address,
    contracts: Address[],
    options?: ClearSigningCallbacks,
  ): Promise<void> {
    if (contracts.length === 0) {
      return;
    }
    const service = this.#requireCredentialService("grantDelegationPermit");
    await requireChainAlignment("grantDelegationPermit", this.#signer, this.#provider);
    await service.grantPermit(contracts, delegator, options);
  }

  /**
   * Pure store lookup: is there a permit covering `contracts`?
   * No wallet prompt, no keypair generation. Returns `false` when no signer
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
   * Wipe FHE permits for the current signer.
   *
   * - With no argument: every permit referencing this signer is removed across
   *   all chains and delegators. The keypair survives — use {@link clear} to
   *   also wipe the keypair.
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
      await swallow("clear decrypt cache", () =>
        this.#cachingService.clearForRequester(signerAddress),
      );
    }
  }

  /**
   * Wipe the keypair for the current signer and cascade-delete every permit
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
      await swallow("clear decrypt cache", () =>
        this.#cachingService.clearForRequester(signerAddress),
      );
    }
  }
}
