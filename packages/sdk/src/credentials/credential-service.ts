import type { Address, Hex } from "viem";
import type { GenericSigner, GenericStorage } from "../types";
import type { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import type { EIP712TypedData } from "../relayer/relayer-sdk.types";
import { ZamaError } from "../errors/base";
import { ConfigurationError } from "../errors/relayer";
import { SignerNotConfiguredError } from "../errors/signer";
import { wrapSigningError } from "../errors/signing";
import { swallow } from "../utils/swallow";
import { KeypairVault } from "./keypair-vault";
import { chunkContracts, uncoveredContracts } from "./permissions";
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
  /**
   * Optional signer. Required for {@link CredentialService.allow},
   * {@link CredentialService.revokePermits}, and
   * {@link CredentialService.clearCredentials}. The deferred-signing entry
   * points ({@link CredentialService.prepareEIP712},
   * {@link CredentialService.registerSignedPermit}) work without a signer
   * (canonical cross-process custody shape).
   */
  signer?: GenericSigner;
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
  readonly #signer: GenericSigner | undefined;
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

  #requireSigner(operation: string): GenericSigner {
    if (!this.#signer) {
      throw new SignerNotConfiguredError(operation);
    }
    return this.#signer;
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
    const signer = this.#requireSigner("allow");
    const account = signer.requireWalletAccount("allow");
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
    const account = this.#signer?.walletAccount.getSnapshot();
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
   * @throws {@link SigningFailedError} if reading the signer address fails.
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
   * @throws {@link SigningFailedError} if reading the signer address fails.
   */
  async clearCredentials(): Promise<void> {
    const signer = this.#requireSigner("clearCredentials");
    const account = signer.requireWalletAccount("clearCredentials");
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
    if (nextAddr) {
      await swallow("warm keypair", async () => {
        await this.#vault.getOrCreate(nextAddr);
      });
    }
  }

  /**
   * Build the EIP-712 envelope and permit context for a deferred-signing
   * credential permit. The caller signs `typedData` externally (custodian,
   * HSM, …) and feeds the signature back to {@link registerSignedPermit}.
   *
   * Signer-optional: when no signer is configured, the caller supplies the
   * `from` (signer wallet address) and `chainId` explicitly — this is the
   * canonical cross-process custody shape.
   *
   * Limited to a single permit chunk (≤ {@link MAX_CONTRACTS_PER_PERMIT}
   * contracts). For larger sets, split at the call site and repeat the
   * prepare → sign → register cycle per chunk. Already-covered contracts
   * are filtered out — if every requested address is already covered, the
   * returned `typedData` is `null` (no signature needed).
   */
  async prepareEIP712(
    contracts: readonly Address[],
    options: { from: Address; chainId: number; delegator?: Address },
  ): Promise<{
    typedData: EIP712TypedData | null;
    keypair: StoredKeypair;
    scope: PermissionScope;
    chunk: ChecksummedAddress[];
    startTimestamp: number;
  }> {
    const { from, chainId, delegator } = options;
    const signerAddress = checksum(from);
    const requested = normalizeAddresses(contracts);
    const keypair = await this.#vault.getOrCreate(signerAddress);
    const scope: PermissionScope = {
      signerAddress,
      chainId,
      delegatorAddress: delegator ? checksum(delegator) : signerAddress,
    };
    if (requested.length === 0) {
      return {
        typedData: null,
        keypair,
        scope,
        chunk: [],
        startTimestamp: nowSeconds(),
      };
    }
    const permits = await this.#store.listUsableAndPrune(scope, keypair.publicKey);
    const uncovered = uncoveredContracts(permits, requested);
    if (uncovered.length === 0) {
      return {
        typedData: null,
        keypair,
        scope,
        chunk: [],
        startTimestamp: nowSeconds(),
      };
    }
    const chunks = chunkContracts(uncovered);
    const [chunk, ...extra] = chunks;
    if (chunk === undefined || extra.length > 0) {
      throw new ConfigurationError(
        `Deferred credential permit accepts at most one permit chunk (≤10 uncovered contracts) per prepare → registerPermit cycle; got ${uncovered.length}. Split contracts at the call site and run one cycle per chunk.`,
      );
    }
    const startTimestamp = nowSeconds();
    const isDelegated = scope.delegatorAddress !== scope.signerAddress;
    const typedData = isDelegated
      ? await this.#relayer.createDelegatedUserDecryptEIP712(
          keypair.publicKey,
          chunk,
          scope.delegatorAddress,
          startTimestamp,
          this.#permitTTL,
        )
      : await this.#relayer.createEIP712(keypair.publicKey, chunk, startTimestamp, this.#permitTTL);
    return { typedData, keypair, scope, chunk, startTimestamp };
  }

  /**
   * Persist a permit produced by an external signature over the typed-data
   * envelope returned from {@link prepareEIP712}. The caller passes back
   * the same `keypair`, `scope`, `chunk`, and `startTimestamp` so the
   * Permission shape matches what `allow` would have produced internally.
   */
  async registerSignedPermit(input: {
    signature: Hex;
    keypair: Pick<StoredKeypair, "publicKey">;
    scope: PermissionScope;
    chunk: ChecksummedAddress[];
    startTimestamp: number;
  }): Promise<Permission> {
    const permission: Permission = {
      keypairPublicKey: input.keypair.publicKey,
      signerAddress: input.scope.signerAddress,
      delegatorAddress: input.scope.delegatorAddress,
      chainId: input.scope.chainId,
      signedContractAddresses: input.chunk,
      signature: input.signature,
      startTimestamp: input.startTimestamp,
      durationDays: this.#permitTTL,
    };
    await swallow("persist permit", () => this.#store.append(input.scope, [permission]));
    return permission;
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

      const signature = await this.#requireSigner("signPermit").signTypedData(eip712);

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
