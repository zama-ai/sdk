import { getAddress, type Address, type Hex } from "viem";
import type { ZamaConfig } from "./config/types";
import { CredentialService } from "./credentials/credential-service";
import {
  ChainMismatchError,
  SignerNotConfiguredError,
  WalletAccountNotReadyError,
  wrapDecryptError,
} from "./errors";
import type { ZamaSDKEvent, ZamaSDKEventInput, ZamaSDKEventListener } from "./events/sdk-events";
import type { DecryptHandle } from "./query/user-decrypt";
import type { RelayerDispatcher } from "./relayer/relayer-dispatcher";
import type {
  ClearValueType,
  EncryptParams,
  EncryptResult,
  Handle,
  PublicDecryptResult,
} from "./relayer/relayer-sdk.types";
import { ReadonlyToken } from "./token/readonly-token";
import { Token } from "./token/token";
import type {
  CredentialPermitRequest,
  ExecuteRequest,
  GenericProvider,
  GenericSigner,
  GenericStorage,
  PreparedFor,
  PreparedTransaction,
  TransactionKind,
  TransactionPrepareRequest,
  TransactionResult,
  WalletAccount,
  WalletAccountChange,
  WalletAccountListener,
} from "./types";
import { swallow } from "./utils";
import { CachingService } from "./services/caching-service";
import { DecryptionService, type BatchDecryptHandlesResult } from "./services/decryption-service";
import { DelegationService } from "./services/delegation-service";
import { EncryptionService } from "./services/encryption-service";
import {
  OfflineSigningService,
  type OfflineSigningOptions,
} from "./services/offline-signing-service";
import { WrappersRegistry } from "./wrappers-registry";

/**
 * ZamaSDK — composes a RelayerSDK with contract abstraction.
 * Provides signer, storage, and high-level confidential contract interface.
 */
export class ZamaSDK {
  readonly relayer: RelayerDispatcher;
  readonly provider: GenericProvider;
  readonly signer: GenericSigner | undefined;
  readonly storage: GenericStorage;
  /**
   * A {@link WrappersRegistry} instance auto-configured for the current chain.
   * Uses built-in defaults from chain configs, and the SDK's `registryTTL` if configured.
   */
  readonly registry: WrappersRegistry;
  readonly #registryTTL: number;
  readonly #onEvent: ZamaSDKEventListener;
  readonly #walletAccountListeners = new Set<WalletAccountListener>();
  readonly #cache: CachingService;
  readonly #credentialService: CredentialService | undefined;
  readonly #delegationService: DelegationService;
  readonly #decryptionService: DecryptionService | undefined;
  readonly #encryptionService: EncryptionService;
  readonly #offlineSigningService: OfflineSigningService | undefined;
  #unsubscribeSigner?: () => void;

  constructor(config: ZamaConfig) {
    this.relayer = config.relayer;
    this.provider = config.provider;
    this.signer = config.signer;
    this.storage = config.storage;
    this.#cache = new CachingService(config.storage);
    this.#onEvent = config.onEvent ?? function () {};
    this.#delegationService = new DelegationService({
      provider: this.provider,
      relayer: this.relayer,
      emitEvent: (input, tokenAddress) => this.emitEvent(input, tokenAddress),
    });
    this.#encryptionService = new EncryptionService({
      relayer: this.relayer,
      emitEvent: (input, tokenAddress) => this.emitEvent(input, tokenAddress),
    });
    const registryAddresses: Record<number, Address> = {};
    for (const chain of config.chains) {
      if (chain.registryAddress) {
        registryAddresses[chain.id] = chain.registryAddress;
      }
    }
    this.registry = new WrappersRegistry({
      provider: this.provider,
      registryAddresses,
      registryTTL: config.registryTTL,
    });
    this.#registryTTL = config.registryTTL;
    if (config.signer) {
      const signer = config.signer;
      this.#credentialService = new CredentialService({
        relayer: this.relayer,
        signer,
        keypairTTL: config.keypairTTL,
        permitTTL: config.permitTTL,
        storage: this.storage,
        permitStorage: config.permitStorage,
      });
      this.#decryptionService = new DecryptionService({
        cache: this.#cache,
        credentialService: this.#credentialService,
        delegationService: this.#delegationService,
        relayer: this.relayer,
        emitEvent: (input) => this.emitEvent(input),
      });
      this.#offlineSigningService = new OfflineSigningService({
        signer,
        provider: this.provider,
        relayer: this.relayer,
        encryption: this.#encryptionService,
        credentials: this.#credentialService,
        emitEvent: (input, tokenAddress) => this.emitEvent(input, tokenAddress),
      });

      this.#unsubscribeSigner = signer.walletAccount.subscribe((change) => {
        this.#handleWalletAccountChange(change).catch((error) => {
          // oxlint-disable-next-line no-console
          console.warn("[zama-sdk] wallet account handler failed:", error);
        });
      });
    } else {
      this.#credentialService = undefined;
      this.#decryptionService = undefined;
      this.#offlineSigningService = undefined;
    }
  }

  /**
   * Return the configured signer or throw {@link SignerNotConfiguredError}.
   *
   * @throws {@link SignerNotConfiguredError} if no signer is configured.
   */
  requireSigner(operation: string): GenericSigner {
    if (!this.signer) {
      throw new SignerNotConfiguredError(operation);
    }
    return this.signer;
  }

  #requireCredentialService(operation: string): CredentialService {
    if (!this.#credentialService) {
      throw new SignerNotConfiguredError(operation);
    }
    return this.#credentialService;
  }

  #requireDecryptionService(operation: string): DecryptionService {
    if (!this.#decryptionService) {
      throw new SignerNotConfiguredError(operation);
    }
    return this.#decryptionService;
  }

  #requireOfflineSigningService(operation: string): OfflineSigningService {
    if (!this.#offlineSigningService) {
      throw new SignerNotConfiguredError(operation);
    }
    return this.#offlineSigningService;
  }

  // ─── Deferred signing pipeline (SDK-75) ──────────────────────────────
  // For institutional custody / HSM / policy-engine workflows where build,
  // sign, and broadcast cannot run synchronously in a single Promise.
  // Atomic call sites (`Token.confidentialTransfer`, etc.) remain unchanged.

  /**
   * Build an RLP-encoded unsigned transaction for the given request. The
   * caller signs it externally — via {@link sign}, an HSM ceremony, an
   * out-of-process custodian — and feeds the result back into
   * {@link broadcast} or {@link execute}.
   *
   * @throws {@link SignerNotConfiguredError} if no signer is configured.
   * @throws {@link ChainMismatchError} if signer and provider disagree.
   */
  prepare<K extends TransactionKind>(
    request: Extract<TransactionPrepareRequest, { kind: K }>,
    options?: OfflineSigningOptions,
  ): Promise<PreparedFor<K>> {
    return this.#requireOfflineSigningService("prepare").prepare(request, options);
  }

  /**
   * Sign a prepared transaction with the configured signer's
   * `signTransaction` capability and return RLP-encoded signed bytes.
   *
   * @throws {@link SignerCapabilityError} if the configured signer does not
   *   implement `signTransaction` (online-only wallet).
   */
  sign(prepared: PreparedTransaction, options?: OfflineSigningOptions): Promise<Hex> {
    return this.#requireOfflineSigningService("sign").sign(prepared, options);
  }

  /**
   * Submit a previously-signed transaction, await its receipt, emit the
   * matching `*Submitted` event, and return the {@link TransactionResult}.
   */
  broadcast(
    prepared: PreparedTransaction,
    signedTx: Hex,
    options?: OfflineSigningOptions,
  ): Promise<TransactionResult> {
    return this.#requireOfflineSigningService("broadcast").broadcast(prepared, signedTx, options);
  }

  /**
   * Bundled in-process flow. Accepts:
   * - a {@link PreparedTransaction} (sign + broadcast),
   * - a {@link TransactionPrepareRequest} (prepare + sign + broadcast),
   * - a {@link CredentialPermitRequest} (atomic EIP-712 permit registration).
   */
  execute(input: PreparedTransaction, options?: OfflineSigningOptions): Promise<TransactionResult>;
  execute(
    input: TransactionPrepareRequest,
    options?: OfflineSigningOptions,
  ): Promise<TransactionResult>;
  execute(input: CredentialPermitRequest, options?: OfflineSigningOptions): Promise<void>;
  execute(
    input: PreparedTransaction | ExecuteRequest,
    options?: OfflineSigningOptions,
  ): Promise<TransactionResult | void> {
    return this.#requireOfflineSigningService("execute").execute(
      input as TransactionPrepareRequest,
      options,
    );
  }

  /**
   * Cache-sync escape hatch when an external process broadcast
   * `prepared.unsignedTx` directly via `eth_sendRawTransaction` and this
   * process needs the matching receipt + event emission without holding
   * the signed bytes.
   */
  completeFromTxHash(
    prepared: PreparedTransaction,
    txHash: Hex,
    options?: OfflineSigningOptions,
  ): Promise<TransactionResult> {
    return this.#requireOfflineSigningService("completeFromTxHash").completeFromTxHash(
      prepared,
      txHash,
      options,
    );
  }

  /**
   * Subscribe to wallet account transitions.
   *
   * @param listener - Called on each transition with a {@link WalletAccountChange} carrying
   *   `previous` and `next` wallet account snapshots; either may be `undefined` for
   *   connect and disconnect transitions.
   * @returns An unsubscribe function; calling it removes the listener.
   *
   * @internal
   */
  onWalletAccountChange(listener: WalletAccountListener): () => void {
    this.#walletAccountListeners.add(listener);
    return () => {
      this.#walletAccountListeners.delete(listener);
    };
  }

  /**
   * Pre-flight chain coherence check for signer-required operations.
   *
   * Throws {@link ChainMismatchError} if they differ.
   *
   * @param operation - The operation name, included in the error message.
   * @returns The chain ID shared by both signer and provider.
   * @throws {@link SignerNotConfiguredError} if no signer is configured.
   * @throws {@link ChainMismatchError} if signer and provider report different chain IDs.
   */
  async requireAlignedWalletAccount(operation: string): Promise<WalletAccount> {
    const signer = this.requireSigner(operation);
    let account: WalletAccount;
    try {
      account = signer.requireWalletAccount(operation);
    } catch (error) {
      if (!(error instanceof WalletAccountNotReadyError) || !signer.refreshWalletAccount) {
        throw error;
      }
      await signer.refreshWalletAccount();
      account = signer.requireWalletAccount(operation);
    }
    const providerChainId = await this.provider.getChainId();
    if (account.chainId !== providerChainId) {
      throw new ChainMismatchError({
        operation,
        signerChainId: account.chainId,
        providerChainId,
      });
    }
    return account;
  }

  async requireChainAlignment(operation: string): Promise<number> {
    return (await this.requireAlignedWalletAccount(operation)).chainId;
  }

  async #handleWalletAccountChange(change: WalletAccountChange): Promise<void> {
    const previousAccount = change.previous;
    const nextAccount = change.next;
    const credentialService = this.#credentialService;
    if (credentialService) {
      await swallow("credential wallet account change", () =>
        credentialService.handleWalletAccountChange(previousAccount, nextAccount),
      );
    }
    if (previousAccount) {
      await swallow("clear decrypt cache", () =>
        this.#cache.clearForRequester(previousAccount.address),
      );
    }
    const nextChainId = nextAccount?.chainId;
    if (nextChainId !== undefined) {
      void swallow("switch relayer chain", () => this.relayer.switchChain(nextChainId));
    }
    await Promise.all(
      Array.from(this.#walletAccountListeners, (listener) =>
        swallow("wallet account listener", () =>
          listener({ previous: previousAccount, next: nextAccount }),
        ),
      ),
    );
  }

  /**
   * Create a read-only interface for a confidential token.
   * Supports balance queries and authorization without a wrapper address.
   *
   * @param address - The confidential token contract address.
   * @returns A {@link ReadonlyToken} instance bound to this SDK.
   */
  createReadonlyToken(address: Address): ReadonlyToken {
    return new ReadonlyToken(this, address);
  }

  /**
   * Create a high-level ERC-20-like interface for a confidential token.
   * Includes write operations (transfer, shield, unshield).
   *
   * @param address - The confidential token contract address (also used as wrapper by default).
   * @param wrapper - Optional explicit wrapper address, if it differs from the token address.
   * @returns A {@link Token} instance bound to this SDK.
   */
  createToken(address: Address, wrapper?: Address): Token {
    return new Token(this, address, wrapper);
  }

  /**
   * Emit a structured SDK event. Used by {@link Token}/{@link ReadonlyToken}
   * to surface lifecycle events through the unified SDK event stream.
   *
   * Listener exceptions are caught and logged so that a misbehaving subscriber
   * can never corrupt SDK operations.
   *
   * Application code should subscribe via the `onEvent` config option, never
   * call this directly.
   *
   * @internal
   */
  emitEvent(input: ZamaSDKEventInput, tokenAddress?: Address): void {
    try {
      this.#onEvent({
        ...input,
        tokenAddress,
        timestamp: Date.now(),
      } as ZamaSDKEvent);
    } catch (error) {
      // oxlint-disable-next-line no-console
      console.error("[zama-sdk] onEvent listener threw:", error);
    }
  }

  /**
   * Create a {@link WrappersRegistry} instance bound to this SDK's provider.
   * On Mainnet and Sepolia the registry address is resolved automatically.
   *
   * @param registryAddresses - Optional per-chain overrides for this registry instance.
   * @returns A {@link WrappersRegistry} instance.
   *
   * @example
   * ```ts
   * // Mainnet / Sepolia — resolved automatically
   * const registry = sdk.createWrappersRegistry();
   *
   * // Hardhat or custom chain — override per chain for this registry instance
   * const registry = sdk.createWrappersRegistry({ [31337]: "0xYourRegistry" });
   *
   * const pairs = await registry.getTokenPairs();
   * ```
   */
  createWrappersRegistry(registryAddresses?: Record<number, Address>): WrappersRegistry {
    return new WrappersRegistry({
      provider: this.provider,
      registryAddresses,
      registryTTL: this.#registryTTL,
    });
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
    await this.requireChainAlignment("allow");
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
    await this.requireChainAlignment("allowAs");
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
   * Delegate decryption rights for a confidential contract to another address.
   * Calls `ACL.delegateForUserDecryption()` on-chain.
   *
   * **Important:** After the transaction is mined, allow **1–2 minutes** before
   * attempting delegated decryption. The delegation is recorded on L1 immediately,
   * but the gateway must sync the ACL state via cross-chain event propagation.
   *
   * @param contractAddress - The confidential contract address to delegate on.
   * @param delegateAddress - Address to delegate decryption rights to.
   * @param expirationDate - Optional expiration date (defaults to permanent delegation via `uint64.max`).
   * @returns The transaction hash and mined receipt.
   * @throws {@link SignerNotConfiguredError} if no signer is configured.
   * @throws {@link ChainMismatchError} if signer and provider are on different chains.
   * @throws {@link DelegationExpirationTooSoonError} if `expirationDate` is less than 1 hour in the future.
   * @throws {@link DelegationSelfNotAllowedError} if the delegate equals the connected wallet.
   * @throws {@link DelegationDelegateEqualsContractError} if the delegate equals the contract address.
   * @throws {@link DelegationExpiryUnchangedError} if the new expiry equals the current one.
   * @throws {@link TransactionRevertedError} if the delegation transaction reverts.
   */
  async delegateDecryption({
    contractAddress,
    delegateAddress,
    expirationDate,
  }: {
    contractAddress: Address;
    delegateAddress: Address;
    expirationDate?: Date;
  }): Promise<TransactionResult> {
    const signer = this.requireSigner("delegateDecryption");
    const account = await this.requireAlignedWalletAccount("delegateDecryption");
    return this.#delegationService.delegateDecryption(signer, {
      contractAddress,
      delegateAddress,
      delegatorAddress: account.address,
      expirationDate,
    });
  }

  /**
   * Revoke decryption delegation for a confidential contract.
   * Calls `ACL.revokeDelegationForUserDecryption()` on-chain.
   *
   * @param contractAddress - The confidential contract address to revoke delegation on.
   * @param delegateAddress - Address to revoke delegation from.
   * @returns The transaction hash and mined receipt.
   * @throws {@link SignerNotConfiguredError} if no signer is configured.
   * @throws {@link ChainMismatchError} if signer and provider are on different chains.
   * @throws {@link DelegationNotFoundError} if no delegation exists for this (delegator, delegate, contract) tuple.
   * @throws {@link TransactionRevertedError} if the revocation transaction reverts.
   */
  async revokeDelegation({
    contractAddress,
    delegateAddress,
  }: {
    contractAddress: Address;
    delegateAddress: Address;
  }): Promise<TransactionResult> {
    const signer = this.requireSigner("revokeDelegation");
    const account = await this.requireAlignedWalletAccount("revokeDelegation");
    return this.#delegationService.revokeDelegation(signer, {
      contractAddress,
      delegateAddress,
      delegatorAddress: account.address,
    });
  }

  /**
   * Check whether a delegation is active for the given contract address.
   *
   * @param contractAddress - The confidential contract address.
   * @param delegatorAddress - The address that granted the delegation.
   * @param delegateAddress - The address that received delegation rights.
   * @returns `true` if the delegation exists and has not expired.
   */
  async isDelegated(params: {
    contractAddress: Address;
    delegatorAddress: Address;
    delegateAddress: Address;
  }): Promise<boolean> {
    return this.#delegationService.isDelegated(params);
  }

  /**
   * Get the expiration timestamp of a delegation for the given contract.
   *
   * @param contractAddress - The confidential contract address.
   * @param delegatorAddress - The address that granted the delegation.
   * @param delegateAddress - The address that received delegation rights.
   * @returns Unix timestamp as bigint. `0n` = no delegation. `2^64 - 1` = permanent.
   */
  async getDelegationExpiry({
    contractAddress,
    delegatorAddress,
    delegateAddress,
  }: {
    contractAddress: Address;
    delegatorAddress: Address;
    delegateAddress: Address;
  }): Promise<bigint> {
    return this.#delegationService.getDelegationExpiry({
      contractAddress,
      delegatorAddress,
      delegateAddress,
    });
  }

  /**
   * Decrypt one or more FHE handles. Results are cached — repeated calls
   * for the same handle skip the relayer round-trip.
   *
   * Zero handles are mapped to `0n` without hitting the relayer.
   * Events (`DecryptStart/End/Error`) are emitted uniformly.
   * Relayer errors are wrapped into typed SDK errors.
   *
   * @param handles - Handles to decrypt, each paired with its contract address.
   * @returns A record mapping each handle to its decrypted clear-text value.
   * @throws {@link SignerNotConfiguredError} if no signer is configured.
   * @throws {@link ChainMismatchError} if signer and provider are on different chains.
   *
   * @example
   * ```ts
   * const values = await sdk.userDecrypt([
   *   { handle: balanceHandle, contractAddress: cUSDT },
   * ]);
   * console.log(values[balanceHandle]); // 1000n
   * ```
   */
  async userDecrypt(handles: DecryptHandle[]): Promise<Record<Handle, ClearValueType>> {
    const service = this.#requireDecryptionService("userDecrypt");
    const account = await this.requireAlignedWalletAccount("userDecrypt");
    return service.userDecrypt(handles, account.address);
  }

  /**
   * Decrypt one or more FHE handles using delegated credentials.
   *
   * Mirrors {@link userDecrypt} with delegated credentials — same caching and
   * zero-handle short-circuit. Before reading from cache or calling the relayer,
   * every non-zero handle's contract must have an active delegation from the
   * delegator to the connected signer; missing or expired delegations fail fast.
   *
   * @param handles - FHE handles paired with their contract addresses.
   * @param delegatorAddress - The address that granted delegation rights.
   * @param accountAddress - Address used as the cache key's "requester"
   *   dimension. Defaults to `delegatorAddress`. Pass the actual account address
   *   when decrypting on behalf of someone whose balance is stored under a
   *   different address (e.g. `decryptBalanceAs` with an explicit `accountAddress`).
   * @returns Map of handle → clear-text value.
   *
   * @example
   * ```ts
   * const values = await sdk.delegatedUserDecrypt([
   *   { handle: balanceHandle, contractAddress: tokenAddr },
   * ], delegatorAddr);
   * console.log(values[balanceHandle]); // 1000n
   * ```
   */
  async delegatedUserDecrypt(
    handles: DecryptHandle[],
    delegatorAddress: Address,
    accountAddress: Address = delegatorAddress,
  ): Promise<Record<Handle, ClearValueType>> {
    const service = this.#requireDecryptionService("delegatedUserDecrypt");
    const account = await this.requireAlignedWalletAccount("delegatedUserDecrypt");
    return service.delegatedUserDecrypt(handles, delegatorAddress, account.address, accountAddress);
  }

  /** @internal */
  async delegatedBatchDecryptHandlesAs({
    handles,
    delegatorAddress,
    accountAddress = delegatorAddress,
    maxConcurrency,
  }: {
    handles: DecryptHandle[];
    delegatorAddress: Address;
    accountAddress?: Address;
    maxConcurrency?: number;
  }): Promise<BatchDecryptHandlesResult> {
    const service = this.#requireDecryptionService("delegatedBatchDecryptHandlesAs");
    const account = await this.requireAlignedWalletAccount("delegatedBatchDecryptHandlesAs");
    return service.delegatedBatchDecryptHandlesAs({
      handles,
      delegatorAddress,
      delegateAddress: account.address,
      accountAddress,
      maxConcurrency,
    });
  }

  /**
   * Publicly decrypt one or more FHE handles.
   *
   * Returns the decryption proof alongside the clear-text values so callers
   * can submit on-chain finalization transactions (e.g. `finalizeUnwrap`).
   *
   * @param handles - FHE handles to decrypt publicly.
   * @returns Clear-text values, ABI-encoded values, and the decryption proof.
   *
   * @example
   * ```ts
   * const { clearValues, decryptionProof, abiEncodedClearValues } =
   *   await sdk.publicDecrypt([handle]);
   * ```
   */
  async publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult> {
    if (handles.length === 0) {
      return {
        clearValues: {},
        decryptionProof: "0x",
        abiEncodedClearValues: "0x",
      };
    }

    try {
      return await this.relayer.publicDecrypt(handles);
    } catch (error) {
      throw wrapDecryptError(error, "Public decryption failed");
    }
  }

  /**
   * Encrypt one or more plaintext values into FHE ciphertexts.
   *
   * @param params - Typed FHE inputs, the target contract address, and the user address.
   * @returns Encrypted handles and the input proof for on-chain submission.
   * @throws {@link EncryptionFailedError} if FHE encryption fails.
   *
   * @example
   * ```ts
   * const { handles, inputProof } = await sdk.encrypt({
   *   values: [{ value: 1000n, type: "euint64" }],
   *   contractAddress: "0xToken",
   *   userAddress: "0xUser",
   * });
   * ```
   */
  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    return this.#encryptionService.encrypt(params);
  }

  /**
   * Wipe FHE permits for the current signer.
   *
   * - With no argument: every permit referencing this signer is removed across
   *   all chains and delegators. The keypair survives — use
   *   {@link clearCredentials} to also wipe the keypair.
   * - With a contract list: every signed permit in the direct-decrypt scope
   *   (current chain) whose immutable payload touches any listed address is
   *   removed. May also drop coverage for other contracts that shared the same
   *   permit. Delegated permits are not touched in this mode.
   *
   * @throws {@link SignerNotConfiguredError} if no signer is configured.
   */
  async revokePermits(contracts?: Address[]): Promise<void> {
    const service = this.#requireCredentialService("revokePermits");
    const account = await this.requireAlignedWalletAccount("revokePermits");
    const signerAddress = getAddress(account.address);
    try {
      await service.revokePermits(contracts);
    } finally {
      await swallow("clear decrypt cache", () => this.#cache.clearForRequester(signerAddress));
    }
  }

  /**
   * Wipe the keypair for the current signer and cascade-delete every permit
   * (across chains and delegators) referencing it.
   *
   * @throws {@link SignerNotConfiguredError} if no signer is configured.
   */
  async clearCredentials(): Promise<void> {
    const service = this.#requireCredentialService("clearCredentials");
    const account = await this.requireAlignedWalletAccount("clearCredentials");
    const signerAddress = getAddress(account.address);
    try {
      await service.clearCredentials();
    } finally {
      await swallow("clear decrypt cache", () => this.#cache.clearForRequester(signerAddress));
    }
  }

  /**
   * Unsubscribe from signer lifecycle events without terminating the relayer.
   * Call this when the SDK instance is being replaced but the relayer is shared
   * (e.g. React provider remount in Strict Mode).
   */
  dispose(): void {
    this.#unsubscribeSigner?.();
    this.#unsubscribeSigner = undefined;
    this.#walletAccountListeners.clear();
  }

  /**
   * Terminate the relayer backend and clean up resources.
   * Call this when the SDK is no longer needed (e.g. on unmount or shutdown).
   */
  terminate(): void {
    this.dispose();
    this.relayer.terminate();
    this.signer?.dispose?.();
  }

  /**
   * Implements the TC39 Explicit Resource Management protocol.
   * Calls {@link terminate} when the `using` binding goes out of scope,
   * unsubscribing signer events and shutting down the relayer.
   *
   * @example
   * ```ts
   * {
   *   using sdk = new ZamaSDK({ relayer, provider, signer, storage });
   *   await sdk.allow([cUSDT]);
   *   const balance = await sdk.createReadonlyToken(cUSDT).balanceOf();
   * } // sdk.terminate() called automatically here
   * ```
   */
  [Symbol.dispose](): void {
    this.terminate();
  }
}
