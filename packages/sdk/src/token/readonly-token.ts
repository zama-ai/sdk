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
import type { GenericSigner, GenericStringStorage } from "./token.types";
import { DecryptionFailedError } from "./errors";
import { CredentialsManager } from "./credential-manager";

/** 32-byte zero handle, used to detect uninitialized encrypted balances. */
export const ZERO_HANDLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

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

  constructor(config: ReadonlyTokenConfig) {
    this.credentials = new CredentialsManager({
      sdk: config.sdk,
      signer: config.signer,
      storage: config.storage,
      durationDays: config.durationDays ?? 1,
    });
    this.sdk = config.sdk;
    this.signer = config.signer;
    this.address = config.address;
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
    const ownerAddress = owner ?? (await this.signer.getAddress());
    const handle = await this.readConfidentialBalanceOf(ownerAddress);

    if (this.isZeroHandle(handle)) return BigInt(0);

    const creds = await this.credentials.get(this.address);

    try {
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

      return result[handle] ?? BigInt(0);
    } catch (error) {
      throw new DecryptionFailedError("Failed to decrypt balance", {
        cause: error instanceof Error ? error : undefined,
      });
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
    const ownerAddress = owner ?? (await this.signer.getAddress());
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
   * Decrypt balances for multiple tokens in parallel.
   * Shares a single set of credentials across all tokens.
   *
   * **Warning:** If a per-token decryption fails and no `onError` callback is
   * provided, the failed token's balance is silently set to `0n` in the result
   * map. Always pass `onError` if you need to detect partial failures.
   *
   * @example
   * ```ts
   * const balances = await ReadonlyToken.batchBalanceOf(tokens);
   * for (const [address, balance] of balances) {
   *   console.log(address, balance);
   * }
   * ```
   */
  static async batchBalanceOf(
    tokens: ReadonlyToken[],
    owner?: Address,
    onError?: (address: Address, error: Error) => void,
  ): Promise<Map<Address, bigint>> {
    if (tokens.length === 0) return new Map();

    const sdk = tokens[0]!.sdk;
    const signer = tokens[0]!.signer;
    const ownerAddress = owner ?? (await signer.getAddress());
    const allAddresses = tokens.map((t) => t.address);

    const creds = await tokens[0]!.credentials.getAll(allAddresses);

    const handles = await Promise.all(tokens.map((t) => t.readConfidentialBalanceOf(ownerAddress)));

    const results = new Map<Address, bigint>();
    const decryptPromises: Promise<void>[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      const handle = handles[i]!;

      if (token.isZeroHandle(handle)) {
        results.set(token.address, BigInt(0));
        continue;
      }

      decryptPromises.push(
        sdk
          .userDecrypt({
            handles: [handle],
            contractAddress: token.address,
            signedContractAddresses: creds.contractAddresses,
            privateKey: creds.privateKey,
            publicKey: creds.publicKey,
            signature: creds.signature,
            signerAddress: ownerAddress,
            startTimestamp: creds.startTimestamp,
            durationDays: creds.durationDays,
          })
          .then((result) => {
            results.set(token.address, result[handle] ?? BigInt(0));
          })
          .catch((error) => {
            onError?.(token.address, error instanceof Error ? error : new Error(String(error)));
            results.set(token.address, BigInt(0));
          }),
      );
    }

    await Promise.all(decryptPromises);
    return results;
  }

  /**
   * Decrypt pre-fetched encrypted handles for multiple tokens in parallel.
   * Use when you already have handles from {@link confidentialBalanceOf}.
   *
   * **Warning:** If a per-token decryption fails and no `onError` callback is
   * provided, the failed token's balance is silently set to `0n` in the result
   * map. Always pass `onError` if you need to detect partial failures.
   *
   * @example
   * ```ts
   * const handles = await Promise.all(tokens.map(t => t.confidentialBalanceOf()));
   * const balances = await ReadonlyToken.batchDecryptBalances(
   *   tokens, handles, owner,
   *   (addr, err) => console.error(`Decrypt failed for ${addr}`, err),
   * );
   * ```
   */
  static async batchDecryptBalances(
    tokens: ReadonlyToken[],
    handles: Address[],
    owner?: Address,
    onError?: (address: Address, error: Error) => void,
  ): Promise<Map<Address, bigint>> {
    if (tokens.length === 0) return new Map();
    if (tokens.length !== handles.length) {
      throw new DecryptionFailedError(
        `tokens.length (${tokens.length}) must equal handles.length (${handles.length})`,
      );
    }

    const sdk = tokens[0]!.sdk;
    const signer = tokens[0]!.signer;
    const allAddresses = tokens.map((t) => t.address);
    const creds = await tokens[0]!.credentials.getAll(allAddresses);
    const signerAddress = owner ?? (await signer.getAddress());

    const results = new Map<Address, bigint>();
    const decryptPromises: Promise<void>[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      const handle = handles[i]!;

      if (token.isZeroHandle(handle)) {
        results.set(token.address, BigInt(0));
        continue;
      }

      decryptPromises.push(
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
            onError?.(token.address, error instanceof Error ? error : new Error(String(error)));
            results.set(token.address, BigInt(0));
          }),
      );
    }

    await Promise.all(decryptPromises);
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
    const exists = await this.signer.readContract<boolean>(
      wrapperExistsContract(coordinatorAddress, this.address),
    );
    if (!exists) return null;
    return this.signer.readContract<Address>(getWrapperContract(coordinatorAddress, this.address));
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
    const underlying = await this.signer.readContract<Address>(underlyingContract(wrapper));
    const userAddress = owner ?? (await this.signer.getAddress());
    return this.signer.readContract<bigint>(allowanceContract(underlying, userAddress, wrapper));
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

    try {
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

      return result[handle] ?? BigInt(0);
    } catch (error) {
      throw new DecryptionFailedError("Failed to decrypt balance", {
        cause: error instanceof Error ? error : undefined,
      });
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

    try {
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

      for (const handle of nonZeroHandles) {
        results.set(handle, decrypted[handle] ?? BigInt(0));
      }
    } catch (error) {
      throw new DecryptionFailedError("Failed to decrypt handles", {
        cause: error instanceof Error ? error : undefined,
      });
    }

    return results;
  }
}
