import { getAddress, type Address, type Hex } from "viem";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { StoredCredentials } from "../types";
import { MemoryStorage } from "../storage/memory-storage";
import {
  BaseCredentialsManager,
  type CredentialsConfig,
  type SigningMeta,
} from "./credentials-manager-base";
import type { CredentialSet } from "./credential-set";
import {
  type BaseEncryptedCredentials,
  assertBaseEncryptedCredentials,
  normalizeAddresses,
  computeStoreKey,
  MAX_CONTRACTS_PER_CREDENTIAL,
} from "./credential-validation";
import { Batcher } from "../utils/batcher";

const batcher = new Batcher(MAX_CONTRACTS_PER_CREDENTIAL);

/** Internal storage shape — same as BaseEncryptedCredentials. */
type EncryptedCredentials = BaseEncryptedCredentials;

/** Configuration for constructing a {@link CredentialsManager}. */
export interface CredentialsManagerConfig extends CredentialsConfig {
  /** FHE relayer backend for keypair generation and EIP-712 creation. */
  relayer: RelayerSDK;
}

function hasExtensionRuntimeId(value: unknown): value is { runtime: { id: string } } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const runtime = Reflect.get(value, "runtime");
  if (typeof runtime !== "object" || runtime === null) {
    return false;
  }
  return typeof Reflect.get(runtime, "id") === "string";
}

/**
 * Manages FHE decrypt credentials for a single wallet.
 * Handles keypair generation, EIP-712 authorization signing, and
 * encrypted persistence scoped to a (wallet address, chain ID) pair.
 */
export class CredentialsManager extends BaseCredentialsManager<
  StoredCredentials,
  EncryptedCredentials
> {
  #relayer: RelayerSDK;
  #cachedStoreKey: string | null = null;
  #cachedStoreKeyIdentity: string | null = null;
  /**
   * FHE keypair cached across `allow()` calls for the lifetime of this manager
   * instance. Generated on the first batch creation and reused for all subsequent
   * new batches, so a single public key covers the entire credential set.
   * Cleared by {@link clear}, {@link revoke}, and any operation that calls
   * {@link clearCaches} (e.g. credential corruption recovery).
   */
  #cachedKeypair: { publicKey: Hex; privateKey: Hex } | null = null;

  /** Derive the deterministic storage key for a given wallet address and chain. */
  static async computeStoreKey(address: Address, chainId: number): Promise<string> {
    return computeStoreKey(getAddress(address), chainId);
  }

  constructor(config: CredentialsManagerConfig) {
    super(config);
    this.#relayer = config.relayer;

    // Warn when using in-memory session storage inside a Chrome extension context
    const chromeNamespace =
      typeof globalThis !== "undefined" ? Reflect.get(globalThis, "chrome") : undefined;
    if (hasExtensionRuntimeId(chromeNamespace) && config.sessionStorage instanceof MemoryStorage) {
      // oxlint-disable-next-line no-console
      console.warn(
        "[zama-sdk] Detected Chrome extension context with in-memory session storage. " +
          "Session signatures will be lost on service worker restart and won't be shared across contexts. " +
          "Consider using chromeSessionStorage instead. ",
      );
    }
  }

  // ── Public API ────────────────────────────────────────────────

  /**
   * Authorize FHE credentials for one or more contract addresses.
   *
   * Addresses are split into batches of ≤ 10 internally to satisfy the fhevm
   * contract limit. Each batch triggers its own EIP-712 wallet prompt (shown
   * sequentially). The returned {@link CredentialSet} routes each address to
   * its batch transparently — callers only need `credSet.credentialFor(address)`.
   *
   * Already-signed batches are retained in storage on failure, so a retry only
   * needs to sign the rejected batch.
   *
   * @throws {@link SigningRejectedError} if the user rejects any batch's wallet signature prompt.
   * @throws {@link SigningFailedError} if a batch signing operation fails for any other reason.
   */
  async allow(...contractAddresses: Address[]): Promise<CredentialSet> {
    const normalized = normalizeAddresses(contractAddresses);
    const key = await this.#storeKey();
    return batcher.execute(normalized, (accumulated) =>
      this.resolveMulti({
        key,
        contracts: accumulated,
        createFn: (batchAddresses: Address[], batchKey: string) =>
          this.#createBatch(batchAddresses, batchKey),
      }),
    );
  }

  /** Check if stored credentials are expired or unusable. */
  async isExpired(contractAddress?: Address): Promise<boolean> {
    return this.checkExpired(await this.#storeKey(), contractAddress);
  }

  /** Revoke the session signature. Next decrypt requires a fresh wallet signature. */
  async revoke(...contractAddresses: Address[]): Promise<void> {
    await this.revokeSession(
      await this.#storeKey(),
      contractAddresses.length > 0 ? contractAddresses : undefined,
    );
  }

  /** Revoke the session signature for a pre-computed store key. */
  async revokeByKey(key: string): Promise<void> {
    await this.revokeSession(key);
  }

  /** Whether a session signature is currently cached and covers the given contracts. */
  async isAllowed(contractAddresses: [Address, ...Address[]]): Promise<boolean> {
    return this.checkAllowed(await this.#storeKey(), contractAddresses);
  }

  /** Delete stored credentials (best-effort). */
  async clear(): Promise<void> {
    await this.clearAll(await this.#storeKey());
  }

  /**
   * Generate fresh FHE credentials for one or more contract addresses and
   * prompt the user to sign the EIP-712 authorization.
   *
   * For more than {@link MAX_CONTRACTS_PER_CREDENTIAL} addresses, prefer
   * {@link allow} which batches transparently. This method operates on a
   * single batch for a given storage key.
   */
  async create(contractAddresses: Address[]): Promise<StoredCredentials> {
    const normalized = normalizeAddresses(contractAddresses);
    const key = await this.#storeKey();
    return this.#createBatch(normalized, key);
  }

  /**
   * Create credentials for a single batch. Reuses the cached FHE keypair when
   * available (set by a previous `allow()` call), or generates a fresh one.
   * Keypair generation runs inside `createCredentials` so failures are wrapped
   * by {@link wrapSigningError} with the correct context prefix.
   */
  async #createBatch(
    contractAddresses: Address[],
    overrideKey?: string,
  ): Promise<StoredCredentials> {
    const key = overrideKey ?? (await this.#storeKey());
    return this.createCredentials({
      key,
      contractAddresses,
      createFn: async () => {
        if (!this.#cachedKeypair) {
          this.#cachedKeypair = await this.#relayer.generateKeypair();
        }
        const keypair = this.#cachedKeypair;
        const startTimestamp = Math.floor(Date.now() / 1000);
        const durationDays = Math.ceil(this.keypairTTL / 86400);

        const eip712 = await this.#relayer.createEIP712(
          keypair.publicKey,
          contractAddresses,
          startTimestamp,
          durationDays,
        );
        const signature = await this.signer.signTypedData(eip712);

        return {
          publicKey: keypair.publicKey,
          privateKey: keypair.privateKey,
          signature,
          contractAddresses,
          startTimestamp,
          durationDays,
        };
      },
      errorContext: "Failed to create decrypt credentials",
    });
  }

  // ── Abstract implementations ──────────────────────────────────

  protected assertEncrypted(data: unknown): asserts data is EncryptedCredentials {
    assertBaseEncryptedCredentials(data);
  }

  protected async signForContracts(meta: SigningMeta, contractAddresses: Address[]): Promise<Hex> {
    const eip712 = await this.#relayer.createEIP712(
      meta.publicKey,
      contractAddresses,
      meta.startTimestamp,
      meta.durationDays,
    );
    return this.signer.signTypedData(eip712);
  }

  protected async encryptCredentials(creds: StoredCredentials): Promise<EncryptedCredentials> {
    const address = await this.signer.getAddress();
    const encryptedPrivateKey = await this.crypto.encrypt(
      creds.privateKey,
      creds.signature,
      address,
    );
    const { privateKey: _, signature: _sig, ...rest } = creds;
    return { ...rest, encryptedPrivateKey };
  }

  protected async decryptCredentials(
    encrypted: EncryptedCredentials,
    signature: Hex,
  ): Promise<StoredCredentials> {
    const address = await this.signer.getAddress();
    const privateKey = await this.crypto.decrypt(encrypted.encryptedPrivateKey, signature, address);
    const { encryptedPrivateKey: _, ...rest } = encrypted;
    return { ...rest, privateKey, signature };
  }

  protected override clearCaches(): void {
    this.#cachedKeypair = null;
    this.#cachedStoreKey = null;
    this.#cachedStoreKeyIdentity = null;
    super.clearCaches();
  }

  // ── Store key ─────────────────────────────────────────────────

  async #storeKey(): Promise<string> {
    const address = await this.signer.getAddress();
    const chainId = await this.signer.getChainId();
    const identity = `${getAddress(address)}:${chainId}`;
    if (this.#cachedStoreKey && this.#cachedStoreKeyIdentity === identity) {
      return this.#cachedStoreKey;
    }
    const key = await CredentialsManager.computeStoreKey(address, chainId);
    this.#cachedStoreKeyIdentity = identity;
    this.#cachedStoreKey = key;
    return key;
  }
}
