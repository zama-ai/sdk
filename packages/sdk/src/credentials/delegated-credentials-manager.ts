import { getAddress, type Address, type Hex } from "viem";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { DelegatedStoredCredentials } from "../types";
import {
  BaseCredentialsManager,
  type CredentialsConfig,
  type SigningMeta,
} from "./credentials-manager-base";
import type { CredentialSet } from "./credential-set";
import {
  type BaseEncryptedCredentials,
  assertDelegatedFields,
  normalizeAddresses,
  computeStoreKey,
  MAX_CONTRACTS_PER_CREDENTIAL,
} from "./credential-validation";
import { Batcher } from "../utils/batcher";

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
  /**
   * FHE keypairs cached per delegator store key, persisted across `allow()` calls.
   * Keyed by the result of {@link #storeKey} (scoped to delegate + delegator + chain),
   * so each delegator maintains its own isolated keypair while sharing none with others.
   * Cleared by {@link clear}, {@link revoke}, and any operation that calls
   * {@link clearCaches}.
   */
  #cachedKeypairs = new Map<string, { publicKey: Hex; privateKey: Hex }>();

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
   * Addresses are split into batches of ≤ 10 internally (same fhevm limit as
   * regular credentials). Each batch triggers its own EIP-712 wallet prompt,
   * shown sequentially. Use {@link CredentialSet.credentialFor} to route each
   * address to its batch transparently.
   *
   * Already-signed batches are retained in storage on failure, so a retry only
   * needs to sign the rejected batch.
   *
   * @throws {@link SigningRejectedError} if the user rejects any batch's wallet signature prompt.
   * @throws {@link SigningFailedError} if a batch signing operation fails for any other reason.
   */
  async allow(
    delegatorAddress: Address,
    ...contractAddresses: Address[]
  ): Promise<CredentialSet<DelegatedStoredCredentials>> {
    const normalizedDelegator = getAddress(delegatorAddress);
    const normalized = normalizeAddresses(contractAddresses);
    const key = await this.#storeKey(normalizedDelegator);
    const batcher = new Batcher(MAX_CONTRACTS_PER_CREDENTIAL);
    return batcher.execute(normalized, (accumulated) =>
      this.resolveMulti({
        key,
        contracts: accumulated,
        createFn: async (batchAddresses: Address[], batchKey: string) => {
          let keypair = this.#cachedKeypairs.get(key);
          if (!keypair) {
            keypair = await this.#relayer.generateKeypair();
            this.#cachedKeypairs.set(key, keypair);
          }
          return this.#createBatch(normalizedDelegator, batchAddresses, keypair, batchKey);
        },
      }),
    );
  }

  /** Check if stored delegated credentials are expired or unusable. */
  async isExpired(delegatorAddress: Address, contractAddress?: Address): Promise<boolean> {
    return this.checkExpired(await this.#storeKey(getAddress(delegatorAddress)), contractAddress);
  }

  /** Revoke the session signature for a delegator. */
  async revoke(delegatorAddress: Address): Promise<void> {
    await this.revokeSession(await this.#storeKey(getAddress(delegatorAddress)));
  }

  /** Whether a session signature is currently cached and covers the given contracts. */
  async isAllowed(
    delegatorAddress: Address,
    contractAddresses: [Address, ...Address[]],
  ): Promise<boolean> {
    return this.checkAllowed(await this.#storeKey(getAddress(delegatorAddress)), contractAddresses);
  }

  /** Delete stored credentials for a delegator (best-effort). */
  async clear(delegatorAddress: Address): Promise<void> {
    await this.clearAll(await this.#storeKey(getAddress(delegatorAddress)));
  }

  // ── Credential creation ───────────────────────────────────────

  async #createBatch(
    delegatorAddress: Address,
    contractAddresses: Address[],
    keypair: { publicKey: Hex; privateKey: Hex },
    overrideKey?: string,
  ): Promise<DelegatedStoredCredentials> {
    const key = overrideKey ?? (await this.#storeKey(delegatorAddress));
    return this.createCredentials({
      key,
      contractAddresses,
      createFn: async () => {
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
    this.#cachedKeypairs.clear();
    this.#cachedStoreKey = null;
    this.#cachedStoreKeyIdentity = null;
    super.clearCaches();
  }

  // ── Private helpers ───────────────────────────────────────────

  async #storeKey(delegatorAddress: Address): Promise<string> {
    const delegateAddress = await this.signer.getAddress();
    const chainId = await this.signer.getChainId();
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
