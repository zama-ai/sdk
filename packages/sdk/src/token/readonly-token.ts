import {
  ERC7984_INTERFACE_ID,
  ERC7984_WRAPPER_INTERFACE_ID,
  allowanceContract,
  confidentialBalanceOfContract,
  decimalsContract,
  nameContract,
  supportsInterfaceContract,
  symbolContract,
  underlyingContract,
  wrapperExistsContract,
  getWrapperContract,
} from "../contracts";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { Address } from "../relayer/relayer-sdk.types";
import { normalizeAddress, pLimit } from "../utils";
import type { GenericSigner, GenericStringStorage } from "./token.types";
import { DecryptionFailedError, NoCiphertextError, RelayerRequestFailedError } from "./errors";
import { CredentialsManager } from "./credential-manager";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { ZamaSDKEventInput, ZamaSDKEventListener } from "../events/sdk-events";

/** 32-byte zero handle, used to detect uninitialized encrypted balances. */
export const ZERO_HANDLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/** Options for {@link ReadonlyToken.batchDecryptBalances}. */
export interface BatchDecryptOptions {
  /** Pre-fetched encrypted handles. When omitted, handles are fetched from the chain. */
  handles?: Address[];
  /** Balance owner address. Defaults to the connected signer. */
  owner?: Address;
  /**
   * Called when decryption fails for a single token. Return a fallback bigint value.
   * When omitted, errors are collected and thrown as an aggregated DecryptionFailedError.
   *
   * @example
   * ```ts
   * // Silent zero (old behavior):
   * onError: () => 0n
   * // Log and use zero:
   * onError: (err, addr) => { console.error(addr, err); return 0n; }
   * ```
   */
  onError?: (error: Error, address: Address) => bigint;
  /** Maximum number of concurrent decrypt calls. Default: `Infinity` (no limit). */
  maxConcurrency?: number;
}

/** Configuration for constructing a {@link ReadonlyToken}. */
export interface ReadonlyTokenConfig {
  /** FHE relayer backend. */
  sdk: RelayerSDK;
  /** Wallet signer for read calls and credential signing. */
  signer: GenericSigner;
  /** Credential storage backend. */
  storage: GenericStringStorage;
  /** Address of the confidential token contract. */
  address: Address;
  /** Number of days FHE credentials remain valid. Default: `1`. */
  durationDays?: number;
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
  protected readonly sdk: RelayerSDK;
  readonly signer: GenericSigner;
  readonly address: Address;
  readonly #onEvent: ZamaSDKEventListener | undefined;

  constructor(config: ReadonlyTokenConfig) {
    const address = normalizeAddress(config.address, "address");
    this.credentials = new CredentialsManager({
      sdk: config.sdk,
      signer: config.signer,
      storage: config.storage,
      durationDays: config.durationDays ?? 1,
      onEvent: config.onEvent,
    });
    this.sdk = config.sdk;
    this.signer = config.signer;
    this.address = address;
    this.#onEvent = config.onEvent;
  }

  /** Emit a structured event (no-op when no listener is registered). */
  protected emit(partial: ZamaSDKEventInput): void {
    this.#onEvent?.({ ...partial, tokenAddress: this.address, timestamp: Date.now() });
  }

  /**
   * Decrypt and return the plaintext balance for the given owner.
   * Generates FHE credentials automatically if they don't exist.
   *
   * @example
   * ```ts
   * const balance = await token.balanceOf();
   * // or for another address:
   * const balance = await token.balanceOf("0xOwner");
   * ```
   */
  async balanceOf(owner?: Address): Promise<bigint> {
    const ownerAddress = owner ? normalizeAddress(owner, "owner") : await this.signer.getAddress();
    const handle = await this.readConfidentialBalanceOf(ownerAddress);

    if (this.isZeroHandle(handle)) return BigInt(0);

    const creds = await this.credentials.get(this.address);

    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.DecryptStart });
      const result = await this.sdk.userDecrypt({
        handles: [handle],
        contractAddress: this.address,
        signedContractAddresses: creds.contractAddresses,
        privateKey: creds.privateKey,
        publicKey: creds.publicKey,
        signature: creds.signature,
        signerAddress: await this.signer.getAddress(),
        startTimestamp: creds.startTimestamp,
        durationDays: creds.durationDays,
      });
      this.emit({ type: ZamaSDKEvents.DecryptEnd, durationMs: Date.now() - t0 });

      return result[handle] ?? BigInt(0);
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.DecryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      throw wrapDecryptError(error, "Failed to decrypt balance");
    }
  }

  /**
   * Return the raw encrypted balance handle without decrypting.
   *
   * @example
   * ```ts
   * const handle = await token.confidentialBalanceOf();
   * ```
   */
  async confidentialBalanceOf(owner?: Address): Promise<Address> {
    const ownerAddress = owner ? normalizeAddress(owner, "owner") : await this.signer.getAddress();
    return this.readConfidentialBalanceOf(ownerAddress);
  }

  /**
   * ERC-165 check for {@link ERC7984_INTERFACE_ID} support.
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
    return result === true;
  }

  /**
   * ERC-165 check for {@link ERC7984_WRAPPER_INTERFACE_ID} support.
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
    return result === true;
  }

  /**
   * Decrypt multiple token balances in parallel.
   * When `handles` are provided, decrypts them directly (useful for two-phase
   * polling where handles are already known). When omitted, fetches handles
   * from the chain first.
   *
   * **Error handling:** If a per-token decryption fails and no `onError` callback
   * is provided, errors are collected and thrown as an aggregated
   * `DecryptionFailedError`. Pass `onError: () => 0n` for the old silent behavior.
   *
   * @example
   * ```ts
   * // Simple one-shot:
   * const balances = await ReadonlyToken.batchDecryptBalances(tokens);
   *
   * // With pre-fetched handles and error callback:
   * const handles = await Promise.all(tokens.map(t => t.confidentialBalanceOf()));
   * const balances = await ReadonlyToken.batchDecryptBalances(tokens, {
   *   handles,
   *   onError: (err, addr) => { console.error(addr, err); return 0n; },
   * });
   * ```
   */
  static async batchDecryptBalances(
    tokens: ReadonlyToken[],
    options?: BatchDecryptOptions,
  ): Promise<Map<Address, bigint>> {
    if (tokens.length === 0) return new Map();

    const { handles, owner, onError, maxConcurrency } = options ?? {};

    const sdk = tokens[0]!.sdk;
    const signer = tokens[0]!.signer;
    const signerAddress = owner ?? (await signer.getAddress());

    const resolvedHandles =
      handles ?? (await Promise.all(tokens.map((t) => t.readConfidentialBalanceOf(signerAddress))));

    if (tokens.length !== resolvedHandles.length) {
      throw new DecryptionFailedError(
        `tokens.length (${tokens.length}) must equal handles.length (${resolvedHandles.length})`,
      );
    }

    const allAddresses = tokens.map((t) => t.address);
    const creds = await tokens[0]!.credentials.getAll(allAddresses);

    const results = new Map<Address, bigint>();
    const errors: Array<{ address: Address; error: Error }> = [];
    const decryptFns: Array<() => Promise<void>> = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      const handle = resolvedHandles[i]!;

      if (token.isZeroHandle(handle)) {
        results.set(token.address, BigInt(0));
        continue;
      }

      decryptFns.push(() =>
        sdk
          .userDecrypt({
            handles: [handle],
            contractAddress: token.address,
            signedContractAddresses: creds.contractAddresses,
            privateKey: creds.privateKey,
            publicKey: creds.publicKey,
            signature: creds.signature,
            signerAddress,
            startTimestamp: creds.startTimestamp,
            durationDays: creds.durationDays,
          })
          .then((result) => {
            results.set(token.address, result[handle] ?? BigInt(0));
          })
          .catch((error) => {
            const err = error instanceof Error ? error : new Error(String(error));
            if (onError) {
              results.set(token.address, onError(err, token.address));
            } else {
              errors.push({ address: token.address, error: err });
            }
          }),
      );
    }

    await pLimit(decryptFns, maxConcurrency);

    if (errors.length > 0) {
      const message = errors.map((e) => `${e.address}: ${e.error.message}`).join("; ");
      throw new DecryptionFailedError(
        `Batch decryption failed for ${errors.length} token(s): ${message}`,
      );
    }

    return results;
  }

  /**
   * Look up the wrapper contract for this token via the deployment coordinator.
   * Returns `null` if no wrapper is deployed.
   *
   * @example
   * ```ts
   * const wrapper = await token.discoverWrapper("0xCoordinator");
   * if (wrapper) {
   *   const fullToken = sdk.createToken(token.address, wrapper);
   * }
   * ```
   */
  async discoverWrapper(coordinatorAddress: Address): Promise<Address | null> {
    const coordinator = normalizeAddress(coordinatorAddress, "coordinatorAddress");
    const exists = await this.signer.readContract<boolean>(
      wrapperExistsContract(coordinator, this.address),
    );
    if (!exists) return null;
    return this.signer.readContract<Address>(getWrapperContract(coordinator, this.address));
  }

  /**
   * Read the underlying ERC-20 address from this token's wrapper contract.
   *
   * @example
   * ```ts
   * const underlying = await token.underlyingToken();
   * ```
   */
  async underlyingToken(): Promise<Address> {
    return this.signer.readContract<Address>(underlyingContract(this.address));
  }

  /**
   * Read the ERC-20 allowance of the underlying token for a given wrapper.
   *
   * @example
   * ```ts
   * const allowance = await token.allowance("0xWrapper");
   * ```
   */
  async allowance(wrapper: Address, owner?: Address): Promise<bigint> {
    const normalizedWrapper = normalizeAddress(wrapper, "wrapper");
    const underlying = await this.signer.readContract<Address>(
      underlyingContract(normalizedWrapper),
    );
    const userAddress = owner ? normalizeAddress(owner, "owner") : await this.signer.getAddress();
    return this.signer.readContract<bigint>(
      allowanceContract(underlying, userAddress, normalizedWrapper),
    );
  }

  /**
   * Read the token name from the contract.
   *
   * @example
   * ```ts
   * const name = await token.name(); // "Wrapped USDC"
   * ```
   */
  async name(): Promise<string> {
    return this.signer.readContract<string>(nameContract(this.address));
  }

  /**
   * Read the token symbol from the contract.
   *
   * @example
   * ```ts
   * const symbol = await token.symbol(); // "cUSDC"
   * ```
   */
  async symbol(): Promise<string> {
    return this.signer.readContract<string>(symbolContract(this.address));
  }

  /**
   * Read the token decimals from the contract.
   *
   * @example
   * ```ts
   * const decimals = await token.decimals(); // 6
   * ```
   */
  async decimals(): Promise<number> {
    return this.signer.readContract<number>(decimalsContract(this.address));
  }

  /**
   * Ensure FHE decrypt credentials exist for this token.
   * Generates a keypair and requests an EIP-712 signature if needed.
   * Call this before any decrypt operation to avoid mid-flow wallet prompts.
   *
   * @example
   * ```ts
   * await token.authorize();
   * // Credentials are now cached — subsequent decrypts won't prompt
   * const balance = await token.balanceOf();
   * ```
   */
  async authorize(): Promise<void> {
    await this.credentials.get(this.address);
  }

  /**
   * Ensure FHE decrypt credentials exist for all given tokens in a single
   * wallet signature. Call this early (e.g. after loading the token list) so
   * that subsequent individual decrypt operations reuse cached credentials.
   *
   * @example
   * ```ts
   * const tokens = addresses.map(a => sdk.createReadonlyToken(a));
   * await ReadonlyToken.authorizeAll(tokens);
   * // All tokens now share the same credentials
   * ```
   */
  static async authorizeAll(tokens: ReadonlyToken[]): Promise<void> {
    if (tokens.length === 0) return;
    const allAddresses = tokens.map((t) => t.address);
    await tokens[0]!.credentials.getAll(allAddresses);
  }

  protected async readConfidentialBalanceOf(owner: Address): Promise<Address> {
    const result = await this.signer.readContract(
      confidentialBalanceOfContract(this.address, owner),
    );
    return this.normalizeHandle(result);
  }

  protected normalizeHandle(value: unknown): Address {
    if (typeof value === "string" && value.startsWith("0x")) {
      return value as Address;
    }
    if (typeof value === "bigint") {
      return `0x${value.toString(16).padStart(64, "0")}`;
    }
    return ZERO_HANDLE;
  }

  isZeroHandle(handle: string): handle is typeof ZERO_HANDLE | `0x` {
    return handle === ZERO_HANDLE || handle === "0x";
  }

  /**
   * Decrypt a single encrypted handle into a plaintext bigint.
   * Returns `0n` for zero handles without calling the relayer.
   *
   * @example
   * ```ts
   * const handle = await token.confidentialBalanceOf();
   * const value = await token.decryptBalance(handle);
   * ```
   */
  async decryptBalance(handle: Address, owner?: Address): Promise<bigint> {
    if (this.isZeroHandle(handle)) return BigInt(0);

    const creds = await this.credentials.get(this.address);

    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.DecryptStart });
      const result = await this.sdk.userDecrypt({
        handles: [handle],
        contractAddress: this.address,
        signedContractAddresses: creds.contractAddresses,
        privateKey: creds.privateKey,
        publicKey: creds.publicKey,
        signature: creds.signature,
        signerAddress: owner ?? (await this.signer.getAddress()),
        startTimestamp: creds.startTimestamp,
        durationDays: creds.durationDays,
      });
      this.emit({ type: ZamaSDKEvents.DecryptEnd, durationMs: Date.now() - t0 });

      return result[handle] ?? BigInt(0);
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.DecryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      throw wrapDecryptError(error, "Failed to decrypt balance");
    }
  }

  /**
   * Batch-decrypt arbitrary encrypted handles in a single relayer call.
   * Zero handles are returned as 0n without hitting the relayer.
   */
  async decryptHandles(handles: Address[], owner?: Address): Promise<Map<Address, bigint>> {
    const results = new Map<Address, bigint>();
    const nonZeroHandles: Address[] = [];

    for (const handle of handles) {
      if (this.isZeroHandle(handle)) {
        results.set(handle, BigInt(0));
      } else {
        nonZeroHandles.push(handle);
      }
    }

    if (nonZeroHandles.length === 0) return results;

    const creds = await this.credentials.get(this.address);

    const t0 = Date.now();
    try {
      this.emit({ type: ZamaSDKEvents.DecryptStart });
      const decrypted = await this.sdk.userDecrypt({
        handles: nonZeroHandles,
        contractAddress: this.address,
        signedContractAddresses: creds.contractAddresses,
        privateKey: creds.privateKey,
        publicKey: creds.publicKey,
        signature: creds.signature,
        signerAddress: owner ?? (await this.signer.getAddress()),
        startTimestamp: creds.startTimestamp,
        durationDays: creds.durationDays,
      });
      this.emit({ type: ZamaSDKEvents.DecryptEnd, durationMs: Date.now() - t0 });

      for (const handle of nonZeroHandles) {
        results.set(handle, decrypted[handle] ?? BigInt(0));
      }
    } catch (error) {
      this.emit({
        type: ZamaSDKEvents.DecryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
      });
      throw wrapDecryptError(error, "Failed to decrypt handles");
    }

    return results;
  }
}

/**
 * Inspect a caught error for an HTTP status code and return the appropriate
 * typed SDK error (NoCiphertextError for 400, RelayerRequestFailedError for
 * other HTTP errors, or the generic DecryptionFailedError as fallback).
 */
/** Coerce an unknown caught value to an Error instance. */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function wrapDecryptError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof NoCiphertextError || error instanceof RelayerRequestFailedError) {
    return error;
  }

  const statusCode =
    error != null &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof (error as Record<string, unknown>).statusCode === "number"
      ? ((error as Record<string, unknown>).statusCode as number)
      : undefined;

  if (statusCode === 400) {
    return new NoCiphertextError(
      error instanceof Error ? error.message : "No ciphertext for this account",
      { cause: error instanceof Error ? error : undefined },
    );
  }

  if (statusCode !== undefined) {
    return new RelayerRequestFailedError(
      error instanceof Error ? error.message : fallbackMessage,
      statusCode,
      { cause: error instanceof Error ? error : undefined },
    );
  }

  return new DecryptionFailedError(fallbackMessage, {
    cause: error instanceof Error ? error : undefined,
  });
}
