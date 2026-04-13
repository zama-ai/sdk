import { type Address, getAddress } from "viem";
import { DecryptCache } from "../decrypt-cache";
import {
  allowanceContract,
  confidentialBalanceOfContract,
  decimalsContract,
  ERC7984_INTERFACE_ID,
  ERC7984_WRAPPER_INTERFACE_ID,
  getDelegationExpiryContract,
  MAX_UINT64,
  nameContract,
  supportsInterfaceContract,
  symbolContract,
  underlyingContract,
} from "../contracts";
import { CredentialsManager } from "../credentials/credentials-manager";
import { DelegatedCredentialsManager } from "../credentials/delegated-credentials-manager";
import {
  DecryptionFailedError,
  DelegationNotPropagatedError,
  NoCiphertextError,
  RelayerRequestFailedError,
  SigningFailedError,
  SigningRejectedError,
} from "../errors";
import type { ZamaSDKEventInput, ZamaSDKEventListener } from "../events/sdk-events";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { Handle } from "../relayer/relayer-sdk.types";
import type { GenericSigner, GenericStorage } from "../types";

/** 32-byte zero handle, used to detect uninitialized encrypted balances. */
export const ZERO_HANDLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/** Configuration for constructing a {@link ReadonlyToken}. */
export interface ReadonlyTokenConfig {
  /** Address of the confidential token contract. */
  address: Address;
  /** FHE relayer backend. */
  relayer: RelayerSDK;
  /** Wallet signer for read calls and credential signing. */
  signer: GenericSigner;
  /** Credential storage backend. */
  storage: GenericStorage;
  /** Session storage for wallet signatures. Shared across all contracts in the same SDK instance. */
  sessionStorage: GenericStorage;
  /** Storage-backed cache for decrypted handle values. When omitted, a private instance is created. */
  cache?: DecryptCache;
  /** Shared CredentialsManager instance. When provided, storage/sessionStorage/keypairTTL/onEvent are ignored for credential creation. */
  credentials?: CredentialsManager;
  /** Shared DelegatedCredentialsManager instance. When provided, storage/sessionStorage/keypairTTL/onEvent are ignored for delegated credential creation. */
  delegatedCredentials?: DelegatedCredentialsManager;
  /** How long the re-encryption keypair remains valid, in seconds. Default: `86400` (1 day). */
  keypairTTL?: number;
  /** Controls session signature lifetime in seconds. Default: `2592000` (30 days). `0` means every operation triggers a signing prompt. `"infinite"` means the session never expires. */
  sessionTTL?: number | "infinite";
  /** Optional structured event listener for debugging and telemetry. */
  onEvent?: ZamaSDKEventListener;
}

/**
 * Read-only interface for a confidential token.
 * Supports balance queries, authorization, and ERC-165 checks.
 * Does not require a wrapper address.
 */
export class ReadonlyToken {
  protected readonly credentials: CredentialsManager;
  protected readonly delegatedCredentials: DelegatedCredentialsManager;
  protected readonly relayer: RelayerSDK;
  readonly signer: GenericSigner;
  readonly address: Address;
  readonly storage: GenericStorage;
  readonly cache: DecryptCache;
  readonly #onEvent: ZamaSDKEventListener | undefined;

  constructor(config: ReadonlyTokenConfig) {
    const credentialsConfig = {
      relayer: config.relayer,
      signer: config.signer,
      storage: config.storage,
      sessionStorage: config.sessionStorage,
      keypairTTL: config.keypairTTL ?? 2592000,
      sessionTTL: config.sessionTTL ?? 2592000,
      onEvent: config.onEvent,
    };
    this.credentials = config.credentials ?? new CredentialsManager(credentialsConfig);
    this.delegatedCredentials =
      config.delegatedCredentials ?? new DelegatedCredentialsManager(credentialsConfig);
    this.relayer = config.relayer;
    this.signer = config.signer;
    this.address = getAddress(config.address);
    this.storage = config.storage;
    this.cache = config.cache ?? new DecryptCache(config.storage);
    this.#onEvent = config.onEvent;
  }

  /** Emit a structured event (no-op when no listener is registered). */
  protected emit(partial: ZamaSDKEventInput): void {
    this.#onEvent?.({
      ...partial,
      tokenAddress: this.address,
      timestamp: Date.now(),
    });
  }

  /**
   * Return the raw encrypted balance handle without decrypting.
   *
   * @param owner - Optional balance owner address. Defaults to the connected signer.
   * @returns The encrypted balance handle as a hex string.
   *
   * @example
   * ```ts
   * const handle = await token.confidentialBalanceOf();
   * ```
   */
  async confidentialBalanceOf(owner?: Address): Promise<Handle> {
    const ownerAddress = owner ? getAddress(owner) : await this.signer.getAddress();
    return this.readConfidentialBalanceOf(ownerAddress);
  }

  /**
   * ERC-165 check for {@link ERC7984_INTERFACE_ID} support.
   *
   * @returns `true` if the contract implements the ERC-7984 confidential token interface.
   *
   * @example
   * ```ts
   * if (await token.isConfidential()) {
   *   // Token supports encrypted operations
   * }
   * ```
   */
  async isConfidential(): Promise<boolean> {
    const result = await this.signer.readContract(
      supportsInterfaceContract(this.address, ERC7984_INTERFACE_ID),
    );
    return result;
  }

  /**
   * ERC-165 check for {@link ERC7984_WRAPPER_INTERFACE_ID} support.
   *
   * @returns `true` if the contract implements the ERC-7984 wrapper interface.
   *
   * @example
   * ```ts
   * if (await token.isWrapper()) {
   *   // Token is a confidential wrapper
   * }
   * ```
   */
  async isWrapper(): Promise<boolean> {
    const result = await this.signer.readContract(
      supportsInterfaceContract(this.address, ERC7984_WRAPPER_INTERFACE_ID),
    );
    return result;
  }

  /**
   * Read the underlying ERC-20 address from this token's wrapper contract.
   *
   * @returns The underlying ERC-20 token address.
   *
   * @example
   * ```ts
   * const underlying = await token.underlyingToken();
   * ```
   */
  async underlyingToken(): Promise<Address> {
    return this.signer.readContract(underlyingContract(this.address));
  }

  /**
   * Read the ERC-20 allowance of the underlying token for a given wrapper.
   *
   * @param wrapper - The wrapper contract address to check allowance for.
   * @param owner - Optional owner address. Defaults to the connected signer.
   * @returns The current allowance as a bigint.
   *
   * @example
   * ```ts
   * const allowance = await token.allowance("0xWrapper");
   * ```
   */
  async allowance(wrapper: Address, owner?: Address): Promise<bigint> {
    const normalizedWrapper = getAddress(wrapper);
    const underlying = await this.signer.readContract(underlyingContract(normalizedWrapper));
    const userAddress = owner ? getAddress(owner) : await this.signer.getAddress();
    return this.signer.readContract(allowanceContract(underlying, userAddress, normalizedWrapper));
  }

  /**
   * Read the token name from the contract.
   *
   * @returns The token name string.
   *
   * @example
   * ```ts
   * const name = await token.name(); // "Wrapped USDC"
   * ```
   */
  async name(): Promise<string> {
    return this.signer.readContract(nameContract(this.address));
  }

  /**
   * Read the token symbol from the contract.
   *
   * @returns The token symbol string.
   *
   * @example
   * ```ts
   * const symbol = await token.symbol(); // "cUSDC"
   * ```
   */
  async symbol(): Promise<string> {
    return this.signer.readContract(symbolContract(this.address));
  }

  /**
   * Read the token decimals from the contract.
   *
   * @returns The number of decimals.
   *
   * @example
   * ```ts
   * const decimals = await token.decimals(); // 6
   * ```
   */
  async decimals(): Promise<number> {
    return this.signer.readContract(decimalsContract(this.address));
  }

  /**
   * Ensure FHE decrypt credentials exist for this token.
   * Generates a keypair and requests an EIP-712 signature if needed.
   * Call this before any decrypt operation to avoid mid-flow wallet prompts.
   *
   * @returns Resolves when credentials are cached.
   *
   * @example
   * ```ts
   * await token.allow();
   * // Credentials are now cached — subsequent decrypts won't prompt
   * const balance = await token.balanceOf();
   * ```
   */
  async allow(): Promise<void> {
    await this.credentials.allow(this.address);
  }

  /**
   * Whether a session signature is currently cached for the connected wallet.
   * Use this to check if decrypt operations can proceed without a wallet prompt.
   */
  async isAllowed(): Promise<boolean> {
    return this.credentials.isAllowed([this.address]);
  }

  /**
   * Revoke the session signature for the connected wallet.
   * Stored credentials remain intact, but the next decrypt operation
   * will require a fresh wallet signature.
   */
  async revoke(...contractAddresses: Address[]): Promise<void> {
    await this.credentials.revoke(...contractAddresses);
  }

  /**
   * Ensure FHE decrypt credentials exist for all given tokens in a single
   * wallet signature. Call this early (e.g. after loading the token list) so
   * that subsequent individual decrypt operations reuse cached credentials.
   *
   * @param tokens - Array of ReadonlyToken instances to allow.
   * @returns Resolves when all credentials are cached.
   *
   * @example
   * ```ts
   * const tokens = addresses.map(a => sdk.createReadonlyToken(a));
   * await ReadonlyToken.allow(...tokens);
   * // All tokens now share the same credentials
   * ```
   */
  static async allow(...tokens: ReadonlyToken[]): Promise<void> {
    if (tokens.length === 0) {
      return;
    }
    const allAddresses = tokens.map((t) => t.address);
    await tokens[0]!.credentials.allow(...allAddresses);
  }

  protected async getAclAddress(): Promise<Address> {
    return this.relayer.getAclAddress();
  }

  /**
   * Check whether a delegation is active for this token's contract address.
   *
   * @param delegatorAddress - The address that granted the delegation.
   * @param delegateAddress - The address that received delegation rights.
   * @returns `true` if the delegation exists and has not expired.
   */
  async isDelegated(params: {
    delegatorAddress: Address;
    delegateAddress: Address;
  }): Promise<boolean> {
    const expiry = await this.getDelegationExpiry(params);
    if (expiry === 0n) {
      return false;
    }
    // Permanent delegation (uint64 max) — skip the RPC round-trip for block timestamp.
    if (expiry === MAX_UINT64) {
      return true;
    }
    const now = await this.signer.getBlockTimestamp();
    return expiry > now;
  }

  /**
   * Get the expiration timestamp of a delegation for this token.
   *
   * @param delegatorAddress - The address that granted the delegation.
   * @param delegateAddress - The address that received delegation rights.
   * @returns Unix timestamp as bigint. `0n` = no delegation. `2^64 - 1` = permanent.
   */
  async getDelegationExpiry({
    delegatorAddress,
    delegateAddress,
  }: {
    delegatorAddress: Address;
    delegateAddress: Address;
  }): Promise<bigint> {
    const acl = await this.getAclAddress();
    return this.signer.readContract(
      getDelegationExpiryContract(
        acl,
        getAddress(delegatorAddress),
        getAddress(delegateAddress),
        this.address,
      ),
    );
  }

  protected async readConfidentialBalanceOf(owner: Address): Promise<Handle> {
    return (await this.signer.readContract(
      confidentialBalanceOfContract(this.address, owner),
    )) as Handle;
  }

  isZeroHandle(handle: string): handle is typeof ZERO_HANDLE | `0x` {
    return handle === ZERO_HANDLE || handle === "0x";
  }
}

/**
 * Inspect a caught error for an HTTP status code and return the appropriate
 * typed SDK error (NoCiphertextError for 400, RelayerRequestFailedError for
 * other HTTP errors, or the generic DecryptionFailedError as fallback).
 *
 * When `isDelegated` is true and the relayer returns a 500, the error is
 * wrapped as {@link DelegationNotPropagatedError} because the most likely
 * cause is that the gateway hasn't synced the delegation from L1 yet.
 */
export function wrapDecryptError(
  error: unknown,
  fallbackMessage: string,
  isDelegated = false,
): Error {
  if (
    error instanceof DecryptionFailedError ||
    error instanceof NoCiphertextError ||
    error instanceof RelayerRequestFailedError ||
    error instanceof DelegationNotPropagatedError ||
    error instanceof SigningRejectedError ||
    error instanceof SigningFailedError
  ) {
    return error;
  }

  const statusCode =
    error !== null &&
    error !== undefined &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof (error as Record<string, unknown>).statusCode === "number"
      ? ((error as Record<string, unknown>).statusCode as number)
      : undefined;

  if (statusCode === 400) {
    return new NoCiphertextError(
      error instanceof Error ? error.message : "No ciphertext for this account",
      { cause: error },
    );
  }

  if (isDelegated && statusCode === 500) {
    return new DelegationNotPropagatedError(
      "Delegated decryption failed with a server error. " +
        "This is most commonly caused by the delegation not having propagated to the gateway yet — " +
        "after granting delegation, allow 1–2 minutes for cross-chain synchronization before retrying. " +
        "If the error persists, the gateway or relayer may be experiencing an unrelated issue.",
      { cause: error },
    );
  }

  if (statusCode !== undefined) {
    return new RelayerRequestFailedError(
      error instanceof Error ? error.message : fallbackMessage,
      statusCode,
      { cause: error },
    );
  }

  return new DecryptionFailedError(fallbackMessage, {
    cause: error,
  });
}
