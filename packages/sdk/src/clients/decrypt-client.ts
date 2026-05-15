import type { Address } from "viem";
import { SignerNotConfiguredError, wrapDecryptError } from "../errors";
import type { DecryptHandle } from "../query/user-decrypt";
import type { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import type { ClearValueType, Handle, PublicDecryptResult } from "../relayer/relayer-sdk.types";
import type { BatchDecryptHandlesResult, DecryptionService } from "../services/decryption-service";
import type { GenericProvider, GenericSigner } from "../types";
import { requireAlignedWalletAccount } from "../utils/alignment";
import { assertNonNullable } from "../utils/assertions";

/**
 * Public client for FHE decryption.
 *
 * Exposed as `sdk.decrypt`. Owns the SDK-level guards (signer requirement on `user`
 * and `delegatedUser`, empty-array short-circuit on `public`, relayer error wrapping)
 * and delegates the actual work to the internal {@link DecryptionService} or the
 * relayer directly for `public`.
 *
 * **Mixed signer requirement:** `user` and `delegatedUser` need a configured signer;
 * `public` does not. Each method documents its requirement in its JSDoc.
 */
export class DecryptClient {
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
    try {
      assertNonNullable(this.#decryptionService, "DecryptClient.#decryptionService");
      return this.#decryptionService;
    } catch (cause) {
      throw new SignerNotConfiguredError(operation, { cause });
    }
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
   * @throws if no signer is configured. {@link SignerNotConfiguredError}
   * @throws if signer and provider are on different chains. {@link ChainMismatchError}
   *
   * @example
   * ```ts
   * const values = await sdk.decrypt.user([
   *   { handle: balanceHandle, contractAddress: cUSDT },
   * ]);
   * console.log(values[balanceHandle]); // 1000n
   * ```
   */
  async user(handles: DecryptHandle[]): Promise<Record<Handle, ClearValueType>> {
    const service = this.#requireDecryptionService("user");
    const account = await requireAlignedWalletAccount("user", this.#signer, this.#provider);
    return service.userDecrypt(handles, account.address);
  }

  /**
   * Decrypt one or more FHE handles using delegated credentials.
   *
   * Mirrors {@link user} with delegated credentials — same caching and
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
   * const values = await sdk.decrypt.delegated([
   *   { handle: balanceHandle, contractAddress: tokenAddr },
   * ], delegatorAddr);
   * console.log(values[balanceHandle]); // 1000n
   * ```
   */
  async delegated(
    handles: DecryptHandle[],
    delegatorAddress: Address,
    accountAddress: Address = delegatorAddress,
  ): Promise<Record<Handle, ClearValueType>> {
    const service = this.#requireDecryptionService("delegated");
    const account = await requireAlignedWalletAccount("delegated", this.#signer, this.#provider);
    return service.delegatedUserDecrypt(handles, delegatorAddress, account.address, accountAddress);
  }

  /**
   * Publicly decrypt one or more FHE handles.
   *
   * Signer-independent: works without a configured signer.
   * Returns the decryption proof alongside the clear-text values so callers
   * can submit on-chain finalization transactions (e.g. `finalizeUnwrap`).
   *
   * @param handles - FHE handles to decrypt publicly.
   * @returns Clear-text values, ABI-encoded values, and the decryption proof.
   *
   * @example
   * ```ts
   * const { clearValues, decryptionProof, abiEncodedClearValues } =
   *   await sdk.decrypt.public([handle]);
   * ```
   */
  async public(handles: Handle[]): Promise<PublicDecryptResult> {
    if (handles.length === 0) {
      return {
        clearValues: {},
        decryptionProof: "0x",
        abiEncodedClearValues: "0x",
      };
    }

    try {
      return await this.#relayer.publicDecrypt(handles);
    } catch (error) {
      throw wrapDecryptError(error, "Public decryption failed");
    }
  }

  /**
   * Batch-decrypt delegated handles with per-handle error isolation.
   *
   * Used by Token batch flows where one failing handle should not abort the rest.
   * Falls back to per-handle decryption on non-fatal batch errors.
   *
   * @internal
   */
  async delegatedBatch({
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
    const service = this.#requireDecryptionService("delegatedBatch");
    const account = await requireAlignedWalletAccount(
      "delegatedBatch",
      this.#signer,
      this.#provider,
    );
    return service.delegatedBatchDecryptHandlesAs({
      handles,
      delegatorAddress,
      delegateAddress: account.address,
      accountAddress,
      maxConcurrency,
    });
  }
}
