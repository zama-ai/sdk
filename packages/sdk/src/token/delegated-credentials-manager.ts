import { getAddress, type Address, type Hex } from "viem";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { DelegatedStoredCredentials } from "./token.types";
import {
  BaseCredentialsManager,
  type CredentialsConfig,
  type SigningMeta,
} from "./credential-manager-base";
import {
  type BaseEncryptedCredentials,
  assertDelegatedFields,
  normalizeAddresses,
  computeStoreKey,
} from "./credential-validation";

/** Internal storage shape — base fields plus delegator/delegate addresses. */
interface EncryptedCredentials extends BaseEncryptedCredentials {
  delegatorAddress: Address;
  delegateAddress: Address;
}

/** Configuration for constructing a {@link DelegatedCredentialsManager}. */
export interface DelegatedCredentialsManagerConfig extends CredentialsConfig {
  /** FHE relayer backend for keypair generation and delegated EIP-712 creation. */
  relayer: RelayerSDK;
}

/** Signing metadata for delegated credentials, adding the delegator's address. */
export interface DelegatedSigningMeta extends SigningMeta {
  /** On-chain address of the account that delegated decryption rights. */
  delegatorAddress: Address;
}

/**
 * Manages FHE decrypt credentials for delegated decryption.
 * Scoped to a (delegate, delegator) pair.
 */
export class DelegatedCredentialsManager extends BaseCredentialsManager<
  DelegatedStoredCredentials,
  EncryptedCredentials
> {
  #relayer: RelayerSDK;
  #cachedStoreKey: string | null = null;
  #cachedStoreKeyIdentity: string | null = null;

  /** Derive the deterministic storage key for a (delegate, delegator, chain) triple. */
  static async computeStoreKey(
    delegateAddress: Address,
    delegatorAddress: Address,
    chainId: number,
  ): Promise<string> {
    return computeStoreKey(getAddress(delegateAddress), getAddress(delegatorAddress), chainId);
  }

  constructor(config: DelegatedCredentialsManagerConfig) {
    super(config);
    this.#relayer = config.relayer;
  }

  // ── Public API ────────────────────────────────────────────────

  /**
   * Authorize FHE delegated credentials for one or more contract addresses.
   *
   * @throws {@link SigningRejectedError} if the user rejects the wallet signature prompt.
   * @throws {@link SigningFailedError} if the signing operation fails for any other reason.
   */
  async allow(
    delegatorAddress: Address,
    ...contractAddresses: Address[]
  ): Promise<DelegatedStoredCredentials> {
    const normalizedDelegator = getAddress(delegatorAddress);
    const normalized = normalizeAddresses(contractAddresses);
    const key = await this.#storeKey(normalizedDelegator);
    return this.resolveCredentials({
      key,
      contracts: normalized,
      createKey: `${normalizedDelegator}:${normalized.join(",")}`,
      createFn: () => this.#create(normalizedDelegator, normalized),
    });
  }

  /** Check if stored delegated credentials are expired or unusable. */
  async isExpired(delegatorAddress: Address, contractAddress?: Address): Promise<boolean> {
    return this.checkExpired(await this.#storeKey(getAddress(delegatorAddress)), contractAddress);
  }

  /** Revoke the session signature for a delegator. */
  async revoke(delegatorAddress: Address): Promise<void> {
    await this.revokeSession(await this.#storeKey(getAddress(delegatorAddress)));
  }

  /** Whether a session signature is currently cached for a delegator. */
  async isAllowed(delegatorAddress: Address): Promise<boolean> {
    return this.checkAllowed(await this.#storeKey(getAddress(delegatorAddress)));
  }

  /** Delete stored credentials for a delegator (best-effort). */
  async clear(delegatorAddress: Address): Promise<void> {
    await this.clearAll(await this.#storeKey(getAddress(delegatorAddress)));
  }

  // ── Credential creation ───────────────────────────────────────

  async #create(
    delegatorAddress: Address,
    contractAddresses: Address[],
  ): Promise<DelegatedStoredCredentials> {
    const key = await this.#storeKey(delegatorAddress);
    return this.createCredentials({
      key,
      contractAddresses,
      createFn: async () => {
        const keypair = await this.#relayer.generateKeypair();
        const delegateAddress = await this.signer.getAddress();
        const startTimestamp = Math.floor(Date.now() / 1000);
        const durationDays = Math.ceil(this.keypairTTL / 86400);

        const meta = {
          publicKey: keypair.publicKey,
          startTimestamp,
          durationDays,
          delegatorAddress,
        };
        const signature = await this.#signDelegated(meta, contractAddresses);

        return {
          publicKey: keypair.publicKey,
          privateKey: keypair.privateKey,
          signature,
          contractAddresses,
          startTimestamp,
          durationDays,
          delegatorAddress,
          delegateAddress,
        };
      },
      errorContext: "Failed to create delegated decrypt credentials",
    });
  }

  // ── Abstract implementations ──────────────────────────────────

  protected assertEncrypted(data: unknown): asserts data is EncryptedCredentials {
    assertDelegatedFields(data);
  }

  protected async signForContracts(
    meta: DelegatedSigningMeta,
    contractAddresses: Address[],
  ): Promise<Hex> {
    return this.#signDelegated(meta, contractAddresses);
  }

  protected async encryptCredentials(
    creds: DelegatedStoredCredentials,
  ): Promise<EncryptedCredentials> {
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
  ): Promise<DelegatedStoredCredentials> {
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

  // ── Private helpers ───────────────────────────────────────────

  async #storeKey(delegatorAddress: Address): Promise<string> {
    const [delegateAddress, chainId] = await Promise.all([
      this.signer.getAddress(),
      this.signer.getChainId(),
    ]);
    const identity = `${getAddress(delegateAddress)}:${getAddress(delegatorAddress)}:${chainId}`;
    if (this.#cachedStoreKey && this.#cachedStoreKeyIdentity === identity) {
      return this.#cachedStoreKey;
    }
    const key = await DelegatedCredentialsManager.computeStoreKey(
      delegateAddress,
      delegatorAddress,
      chainId,
    );
    this.#cachedStoreKeyIdentity = identity;
    this.#cachedStoreKey = key;
    return key;
  }

  async #signDelegated(meta: DelegatedSigningMeta, contractAddresses: Address[]): Promise<Hex> {
    const delegatedEIP712 = await this.#relayer.createDelegatedUserDecryptEIP712(
      meta.publicKey,
      contractAddresses,
      meta.delegatorAddress,
      meta.startTimestamp,
      meta.durationDays,
    );
    return this.signer.signTypedData({
      domain: {
        ...delegatedEIP712.domain,
        chainId: Number(delegatedEIP712.domain.chainId),
      },
      types: delegatedEIP712.types,
      message: {
        ...delegatedEIP712.message,
        startTimestamp: BigInt(delegatedEIP712.message.startTimestamp),
        durationDays: BigInt(delegatedEIP712.message.durationDays),
      },
    });
  }
}
