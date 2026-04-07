import { getAddress, type Address, type Hex } from "viem";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { StoredCredentials } from "../types";
import { MemoryStorage } from "../storage/memory-storage";
import {
  BaseCredentialsManager,
  type CredentialsConfig,
  type SigningMeta,
} from "./credentials-manager-base";
import {
  type BaseEncryptedCredentials,
  assertBaseEncryptedCredentials,
  normalizeAddresses,
  computeStoreKey,
} from "./credential-validation";

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
   * @throws {@link SigningRejectedError} if the user rejects the wallet signature prompt.
   * @throws {@link SigningFailedError} if the signing operation fails for any other reason.
   */
  async allow(...contractAddresses: Address[]): Promise<StoredCredentials> {
    const normalized = normalizeAddresses(contractAddresses);
    const key = await this.#storeKey();
    return this.resolveCredentials({
      key,
      contracts: normalized,
      createKey: normalized.join(","),
      createFn: () => this.create(normalized),
    });
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
  async isAllowed(...contractAddresses: Address[]): Promise<boolean> {
    return this.checkAllowed(
      await this.#storeKey(),
      contractAddresses.length > 0 ? contractAddresses : undefined,
    );
  }

  /** Delete stored credentials (best-effort). */
  async clear(): Promise<void> {
    await this.clearAll(await this.#storeKey());
  }

  /**
   * Generate a fresh FHE keypair, create an EIP-712 authorization, and
   * prompt the user to sign it.
   */
  async create(contractAddresses: Address[]): Promise<StoredCredentials> {
    const normalized = normalizeAddresses(contractAddresses);
    const key = await this.#storeKey();
    return this.createCredentials({
      key,
      contractAddresses: normalized,
      createFn: async () => {
        const keypair = await this.#relayer.generateKeypair();
        const startTimestamp = Math.floor(Date.now() / 1000);
        const durationDays = Math.ceil(this.keypairTTL / 86400);

        const eip712 = await this.#relayer.createEIP712(
          keypair.publicKey,
          normalized,
          startTimestamp,
          durationDays,
        );
        const signature = await this.signer.signTypedData(eip712);

        return {
          publicKey: keypair.publicKey,
          privateKey: keypair.privateKey,
          signature,
          contractAddresses: normalized,
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
