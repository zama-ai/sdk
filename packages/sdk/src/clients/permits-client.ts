import { getAddress, type Address } from "viem";
import type { CredentialService } from "../credentials/credential-service";
import { SignerNotConfiguredError } from "../errors";
import type { CachingService } from "../services/caching-service";
import type { GenericProvider, GenericSigner } from "../types";
import { swallow } from "../utils";
import { requireAlignedWalletAccount, requireChainAlignment } from "../utils/alignment";
import { assertNonNullable } from "../utils/assertions";

/**
 * Public client for permit and keypair management.
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
export class PermitsClient {
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
    try {
      assertNonNullable(this.#credentialService, "PermitsClient.#credentialService");
      return this.#credentialService;
    } catch (cause) {
      throw new SignerNotConfiguredError(operation, { cause });
    }
  }

  /**
   * Pre-authorize contract addresses for direct decryption.
   *
   * If a permit covering the requested set already exists, no wallet prompt
   * occurs. Otherwise the SDK chunks the uncovered subset into groups of ≤10
   * contracts and prompts once per chunk; partial mid-flight rejection is
   * preserved (already-signed chunks are persisted before the next prompt).
   *
   * @param contracts - Contract addresses to authorize.
   */
  async allow(contracts: Address[]): Promise<void> {
    if (contracts.length === 0) {
      return;
    }
    const service = this.#requireCredentialService("allow");
    await requireChainAlignment("allow", this.#signer, this.#provider);
    await service.allow(contracts);
  }

  /**
   * Pre-authorize contract addresses for delegated decryption on behalf of `delegator`.
   *
   * @param delegator - The address that delegated decryption rights to the connected signer.
   * @param contracts - Contract addresses to authorize.
   */
  async allowAs(delegator: Address, contracts: Address[]): Promise<void> {
    if (contracts.length === 0) {
      return;
    }
    const service = this.#requireCredentialService("allowAs");
    await requireChainAlignment("allowAs", this.#signer, this.#provider);
    await service.allow(contracts, delegator);
  }

  /**
   * Pure store lookup: are stored permits sufficient to cover `contracts`?
   * No wallet prompt, no keypair generation. Returns `false` when no signer
   * is configured.
   */
  async isAllowed(contracts: Address[]): Promise<boolean> {
    if (!this.#credentialService) {
      return false;
    }
    return this.#credentialService.isAllowed(contracts);
  }

  /**
   * Pure store lookup for a delegated scope. No wallet prompt. See {@link isAllowed}.
   *
   * @param delegator - The address that delegated decryption rights to the connected signer.
   * @param contracts - Contract addresses to check.
   * @returns `true` if cached delegated permits cover all requested contracts.
   */
  async isAllowedAs(delegator: Address, contracts: Address[]): Promise<boolean> {
    if (!this.#credentialService) {
      return false;
    }
    return this.#credentialService.isAllowed(contracts, delegator);
  }

  /**
   * Wipe FHE permits for the current signer.
   *
   * - With no argument: every permit referencing this signer is removed across
   *   all chains and delegators. The keypair survives — use {@link clear} to
   *   also wipe the keypair.
   * - With a contract list: every signed permit in the direct-decrypt scope
   *   (current chain) whose immutable payload touches any listed address is
   *   removed. Delegated permits are not touched in this mode.
   *
   * @throws {@link SignerNotConfiguredError} if no signer is configured.
   */
  async revoke(contracts?: Address[]): Promise<void> {
    const service = this.#requireCredentialService("revoke");
    const account = await requireAlignedWalletAccount("revoke", this.#signer, this.#provider);
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
   * @throws {@link SignerNotConfiguredError} if no signer is configured.
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
