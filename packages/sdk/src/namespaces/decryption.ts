import type { Address } from "viem";
import { requireConfigured, wrapDecryptError } from "../errors";
import type { EncryptedInput } from "../query/user-decrypt";
import type { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import type { ClearValue, EncryptedValue, PublicDecryptResult } from "../relayer/relayer-sdk.types";
import type { BatchDecryptHandlesResult, DecryptionService } from "../services/decryption-service";
import type { GenericProvider, GenericSigner } from "../types";
import { requireAlignedWalletAccount } from "../utils/alignment";

/**
 * Public namespace for FHE decryption.
 *
 * Exposed as `sdk.decryption`. Owns the SDK-level guards (signer requirement on
 * `userDecrypt` and `delegatedDecrypt`, empty-array short-circuit on `publicDecrypt`,
 * relayer error wrapping) and delegates the actual work to the internal
 * {@link DecryptionService} or the relayer directly for `publicDecrypt`.
 *
 * **Mixed signer requirement:** `userDecrypt` and `delegatedDecrypt` need a configured
 * signer; `publicDecrypt` does not. Each method documents its requirement in its JSDoc.
 */
export class Decryption {
  readonly #signer: GenericSigner | undefined;
  readonly #provider: GenericProvider;
  readonly #relayer: RelayerDispatcher;
  readonly #decryptionService: DecryptionService | undefined;

  /** @internal */
  constructor(opts: {
    signer: GenericSigner | undefined;
    provider: GenericProvider;
    relayer: RelayerDispatcher;
    decryptionService: DecryptionService | undefined;
  }) {
    this.#signer = opts.signer;
    this.#provider = opts.provider;
    this.#relayer = opts.relayer;
    this.#decryptionService = opts.decryptionService;
  }

  #requireDecryptionService(operation: string): DecryptionService {
    return requireConfigured(this.#decryptionService, operation);
  }

  /**
   * Decrypt one or more FHE encrypted values. Results are cached — repeated calls
   * for the same encrypted value skip the relayer round-trip.
   *
   * Zero encrypted values are mapped to `0n` without hitting the relayer.
   * Events (`DecryptStart/End/Error`) are emitted uniformly.
   * Relayer errors are wrapped into typed SDK errors.
   *
   * @param encryptedInput - Encrypted values to decrypt, each paired with its contract address.
   * @returns A record mapping each encrypted value to its decrypted clear-text value.
   * @throws if no signer is configured. {@link SignerNotConfiguredError}
   * @throws if signer and provider are on different chains. {@link ChainMismatchError}
   *
   * @example
   * ```ts
   * const values = await sdk.decryption.userDecrypt([
   *   { encryptedValue: balanceHandle, contractAddress: cUSDT },
   * ]);
   * console.log(values[balanceHandle]); // 1000n
   * ```
   */
  async userDecrypt(encryptedInput: EncryptedInput[]): Promise<Record<EncryptedValue, ClearValue>> {
    const service = this.#requireDecryptionService("userDecrypt");
    const account = await requireAlignedWalletAccount("userDecrypt", this.#signer, this.#provider);
    return service.userDecrypt(encryptedInput, account.address);
  }

  /**
   * Decrypt one or more FHE encrypted values using delegated credentials.
   *
   * Mirrors {@link userDecrypt} with delegated credentials — same caching and
   * zero-value short-circuit. Before reading from cache or calling the relayer,
   * every non-zero encrypted value's contract must have an active delegation from the
   * delegator to the connected signer; missing or expired delegations fail fast.
   *
   * @param encryptedInputs - FHE encrypted values paired with their contract addresses.
   * @param delegatorAddress - The address that granted delegation rights.
   * @param accountAddress - Address used as the cache key's "requester"
   *   dimension. Defaults to `delegatorAddress`. Pass the actual account address
   *   when decrypting on behalf of someone whose balance is stored under a
   *   different address (e.g. `decryptBalanceAs` with an explicit `accountAddress`).
   * @returns Map of encrypted value → clear-text value.
   *
   * @example
   * ```ts
   * const values = await sdk.decryption.delegatedDecrypt([
   *   { encryptedValue: balanceHandle, contractAddress: tokenAddr },
   * ], delegatorAddr);
   * console.log(values[balanceHandle]); // 1000n
   * ```
   */
  async delegatedDecrypt(
    encryptedInputs: EncryptedInput[],
    delegatorAddress: Address,
    accountAddress: Address = delegatorAddress,
  ): Promise<Record<EncryptedValue, ClearValue>> {
    const service = this.#requireDecryptionService("delegatedDecrypt");
    const account = await requireAlignedWalletAccount(
      "delegatedDecrypt",
      this.#signer,
      this.#provider,
    );
    return service.delegatedUserDecrypt(
      encryptedInputs,
      delegatorAddress,
      account.address,
      accountAddress,
    );
  }

  /**
   * Publicly decrypt one or more FHE encrypted values.
   *
   * Signer-independent: works without a configured signer.
   * Returns the decryption proof alongside the clear-text values so callers
   * can submit on-chain finalization transactions (e.g. `finalizeUnwrap`).
   *
   * @param encryptedValues - FHE encrypted values to decrypt publicly.
   * @returns Clear-text values, ABI-encoded values, and the decryption proof.
   *
   * @example
   * ```ts
   * const { clearValues, decryptionProof, abiEncodedClearValues } =
   *   await sdk.decryption.publicDecrypt([encryptedValue]);
   * ```
   */
  async publicDecrypt(encryptedValues: EncryptedValue[]): Promise<PublicDecryptResult> {
    if (encryptedValues.length === 0) {
      return {
        clearValues: {},
        decryptionProof: "0x",
        abiEncodedClearValues: "0x",
      };
    }

    try {
      return await this.#relayer.publicDecrypt(encryptedValues);
    } catch (error) {
      throw wrapDecryptError(error, "Public decryption failed");
    }
  }

  /**
   * Batch-decrypt delegated encrypted values with per-entry error isolation.
   *
   * Attempts a single batch request first. If the batch fails with a non-fatal
   * error (e.g. one entry is invalid), falls back to per-entry decryption so
   * healthy entries still resolve. Each item in the result carries either a
   * decrypted value or an error — callers decide how to surface partial failures.
   *
   * @param encryptedInputs - FHE encrypted values paired with their contract addresses.
   * @param delegatorAddress - The address that granted delegation rights.
   * @param accountAddress - The account on whose behalf decryption is performed. Defaults to `delegatorAddress`.
   * @param maxConcurrency - Maximum parallel decrypt calls during per-entry fallback.
   * @returns Per-entry results, each with a value or an error.
   * @throws if no signer is configured. {@link SignerNotConfiguredError}
   * @throws if signer and provider are on different chains. {@link ChainMismatchError}
   *
   * @example
   * ```ts
   * const result = await sdk.decryption.delegatedBatchDecrypt({
   *   encryptedInputs: [
   *     { encryptedValue: encryptedValue1, contractAddress: tokenA },
   *     { encryptedValue: encryptedValue2, contractAddress: tokenB },
   *   ],
   *   delegatorAddress: "0xDelegator",
   *   maxConcurrency: 5,
   * });
   * for (const item of result.items) {
   *   if (item.error) console.error(item.encryptedValue, item.error);
   *   else console.log(item.encryptedValue, item.value);
   * }
   * ```
   */
  async delegatedBatchDecrypt({
    encryptedInputs,
    delegatorAddress,
    accountAddress = delegatorAddress,
    maxConcurrency,
  }: {
    encryptedInputs: EncryptedInput[];
    delegatorAddress: Address;
    accountAddress?: Address;
    maxConcurrency?: number;
  }): Promise<BatchDecryptHandlesResult> {
    const service = this.#requireDecryptionService("delegatedBatchDecrypt");
    const account = await requireAlignedWalletAccount(
      "delegatedBatchDecrypt",
      this.#signer,
      this.#provider,
    );
    return service.delegatedBatchDecryptHandlesAs({
      encryptedInputs,
      delegatorAddress,
      delegateAddress: account.address,
      accountAddress,
      maxConcurrency,
    });
  }
}
