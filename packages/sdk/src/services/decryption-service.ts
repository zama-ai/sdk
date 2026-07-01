import { getAddress, type Address } from "viem";
import type { CredentialService } from "../credentials/credential-service";
import {
  resolveDelegatedDecryptPermit,
  resolveUserDecryptPermit,
} from "../credentials/decrypt-permit";
import type { StoredTransportKeyPairWithPermits } from "../credentials/types";
import {
  type DecryptErrorContext,
  DecryptionFailedError,
  DelegationNotPropagatedError,
  isFatalBatchError,
  RpcRateLimitError,
  wrapDecryptError,
  ZamaError,
} from "../errors";
import type { ZamaSDKEventInput } from "../events/sdk-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { EncryptedInput } from "../query/user-decrypt";
import type { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import type { ClearValue, EncryptedValue } from "../relayer/relayer-sdk.types";
import { pLimit } from "../utils/concurrency";
import { isEncryptedValueZero } from "../utils/handles";
import { extractRetryAfter, isRpcRateLimitError, toError } from "../utils";
import type { CachingService } from "./caching-service";
import type { DelegationService } from "./delegation-service";

interface DecryptionStrategy {
  requesterAddress: Address;
  /** The ACL actor whose entitlement is checked (signer, or delegator when delegated). */
  aclActorAddress: Address;
  resolveCredentials: (contractAddresses: Address[]) => Promise<StoredTransportKeyPairWithPermits>;
  validate?: (contractAddresses: readonly Address[]) => Promise<void>;
  decryptContract: (args: {
    credentials: StoredTransportKeyPairWithPermits;
    contractAddress: Address;
    encryptedValues: EncryptedValue[];
  }) => Promise<Record<EncryptedValue, ClearValue>>;
  errorMessage: string;
  delegated?: boolean;
}

export interface BatchDecryptItem {
  encryptedValue: EncryptedValue;
  contractAddress: Address;
  value?: ClearValue;
  error?: ZamaError;
}

export interface BatchDecryptResult {
  items: BatchDecryptItem[];
}

export class DecryptionService {
  readonly #cache: CachingService;
  readonly #credentialService: CredentialService;
  readonly #delegationService: DelegationService;
  readonly #relayer: RelayerDispatcher;
  readonly #emitEvent: (input: ZamaSDKEventInput) => void;

  constructor({
    cache,
    credentialService,
    delegationService,
    relayer,
    emitEvent,
  }: {
    cache: CachingService;
    credentialService: CredentialService;
    delegationService: DelegationService;
    relayer: RelayerDispatcher;
    emitEvent: (input: ZamaSDKEventInput) => void;
  }) {
    this.#cache = cache;
    this.#credentialService = credentialService;
    this.#delegationService = delegationService;
    this.#relayer = relayer;
    this.#emitEvent = emitEvent;
  }

  async userDecrypt(
    handles: EncryptedInput[],
    signerAddress: Address,
  ): Promise<Record<EncryptedValue, ClearValue>> {
    const normalizedSigner = getAddress(signerAddress);
    return this.#decrypt(handles, {
      requesterAddress: normalizedSigner,
      aclActorAddress: normalizedSigner,
      resolveCredentials: (contractAddresses) =>
        this.#credentialService.grantPermit(contractAddresses),
      decryptContract: async ({ credentials, contractAddress, encryptedValues }) => {
        return this.#relayer.userDecrypt({
          encryptedValues,
          contractAddress,
          ...resolveUserDecryptPermit(credentials, contractAddress),
          signerAddress: normalizedSigner,
        });
      },
      errorMessage: "Failed to decrypt encrypted values",
    });
  }

  async delegatedUserDecrypt(
    encryptedValues: EncryptedInput[],
    delegatorAddress: Address,
    delegateAddress: Address,
    accountAddress: Address,
  ): Promise<Record<EncryptedValue, ClearValue>> {
    const normalizedDelegator = getAddress(delegatorAddress);
    const normalizedDelegate = getAddress(delegateAddress);
    return this.#decrypt(encryptedValues, {
      requesterAddress: getAddress(accountAddress),
      aclActorAddress: normalizedDelegator,
      resolveCredentials: (contractAddresses) =>
        this.#credentialService.grantPermit(contractAddresses, normalizedDelegator),
      validate: (contractAddresses) =>
        this.#assertAllDelegationsActive(contractAddresses, {
          delegatorAddress: normalizedDelegator,
          delegateAddress: normalizedDelegate,
        }),
      decryptContract: async ({
        credentials,
        contractAddress,
        // oxlint-disable-next-line no-shadow
        encryptedValues,
      }) => {
        return this.#relayer.delegatedUserDecrypt({
          encryptedValues: encryptedValues,
          contractAddress,
          ...resolveDelegatedDecryptPermit(credentials, contractAddress),
          delegateAddress: normalizedDelegate,
        });
      },
      errorMessage: "Failed to decrypt delegated encrypted values",
      delegated: true,
    });
  }

  /**
   * Probe whether a delegation has propagated to the gateway and is usable.
   *
   * Forces a delegated-decrypt round-trip — bypassing the decrypt cache and the
   * zero-value short-circuit — so the gateway's synced ACL copy is actually
   * exercised. Host-chain validation runs first; a missing or expired grant
   * throws rather than returning `false`, because that is a distinct condition
   * from "granted but not yet synced".
   *
   * @param encryptedValues - Encrypted values to probe, each paired with its contract.
   * @param delegatorAddress - The address that granted delegation rights.
   * @param delegateAddress - The connected signer acting as delegate.
   * @returns `true` if the relayer accepts the request (delegation is usable),
   *   `false` if it rejects with not-propagated.
   * @throws if no grant exists on the host chain. {@link DelegationNotFoundError}
   * @throws if the grant has expired on the host chain. {@link DelegationExpiredError}
   */
  async isDelegationPropagated(
    encryptedValues: EncryptedInput[],
    delegatorAddress: Address,
    delegateAddress: Address,
  ): Promise<boolean> {
    if (encryptedValues.length === 0) {
      return true;
    }

    const normalizedDelegator = getAddress(delegatorAddress);
    const normalizedDelegate = getAddress(delegateAddress);
    const normalized = encryptedValues.map((h) => ({
      encryptedValue: h.encryptedValue,
      contractAddress: getAddress(h.contractAddress),
    }));
    const contracts = Array.from(new Set(normalized.map((h) => h.contractAddress)));

    // Host-chain check first: a missing/expired grant is not a propagation
    // signal, so let it throw rather than collapsing it into `false`.
    await this.#assertAllDelegationsActive(contracts, {
      delegatorAddress: normalizedDelegator,
      delegateAddress: normalizedDelegate,
    });

    // Force a relayer round-trip — no cache read, no zero-value short-circuit —
    // so the gateway's synced ACL is the thing actually being tested.
    const credentials = await this.#credentialService.grantPermit(contracts, normalizedDelegator);
    const byContract = new Map<Address, EncryptedValue[]>();
    for (const h of normalized) {
      const existing = byContract.get(h.contractAddress);
      if (existing) {
        existing.push(h.encryptedValue);
      } else {
        byContract.set(h.contractAddress, [h.encryptedValue]);
      }
    }

    try {
      await pLimit(
        [...byContract.entries()].map(([contractAddress, values]) => async () => {
          await this.#relayer.delegatedUserDecrypt({
            encryptedValues: values,
            contractAddress,
            ...resolveDelegatedDecryptPermit(credentials, contractAddress),
            delegateAddress: normalizedDelegate,
          });
        }),
        5,
      );
      return true;
    } catch (error) {
      // A not-propagated signal — a delegated 500, or (once the classify-once
      // change lands) a delegated ACL denial from the delegator's stale
      // `persistAllowed` read — is the "still syncing" case this probe reports
      // as `false`. Both surface as DelegationNotPropagatedError; anything else
      // (genuine outage, expired grant) rethrows.
      const wrapped = wrapDecryptError(error, "Failed to probe delegation propagation", {
        isDelegated: true,
      });
      if (wrapped instanceof DelegationNotPropagatedError) {
        return false;
      }
      throw wrapped;
    }
  }

  async delegatedBatchDecryptHandlesAs({
    encryptedInputs,
    delegatorAddress,
    delegateAddress,
    accountAddress,
    maxConcurrency = 5,
  }: {
    encryptedInputs: EncryptedInput[];
    delegatorAddress: Address;
    delegateAddress: Address;
    accountAddress: Address;
    maxConcurrency?: number;
  }): Promise<BatchDecryptResult> {
    const items: BatchDecryptItem[] = encryptedInputs.map((h) => ({
      encryptedValue: h.encryptedValue,
      contractAddress: getAddress(h.contractAddress),
    }));
    if (items.length === 0) {
      return { items };
    }
    const normalizedAccount = getAddress(accountAddress);

    try {
      const decrypted = await this.delegatedUserDecrypt(
        items.map(({ encryptedValue, contractAddress }) => ({ encryptedValue, contractAddress })),
        delegatorAddress,
        delegateAddress,
        normalizedAccount,
      );
      for (const item of items) {
        this.#setHandleResult(item, decrypted);
      }
      return { items };
    } catch (error) {
      if (isFatalBatchError(error)) {
        throw error;
      }
      if (items.length === 1) {
        const [item = this.#missingBatchItem()] = items;
        item.error = this.#toZamaError(error, "Failed to decrypt delegated encrypted values", {
          isDelegated: true,
          contractAddress: item.contractAddress,
          account: getAddress(delegatorAddress),
        });
        return { items };
      }
    }

    // `pLimit` has no cancellation: once one worker rethrows a fatal error
    // (e.g. an RPC rate-limit), the sibling workers would otherwise keep
    // draining the queue and re-hitting the already-throttled endpoint. A
    // shared flag lets the still-queued items short-circuit instead.
    let aborted = false;
    await pLimit(
      items.map((item) => async () => {
        if (aborted) {
          return;
        }
        try {
          const decrypted = await this.delegatedUserDecrypt(
            [{ encryptedValue: item.encryptedValue, contractAddress: item.contractAddress }],
            delegatorAddress,
            delegateAddress,
            normalizedAccount,
          );
          this.#setHandleResult(item, decrypted);
        } catch (error) {
          if (isFatalBatchError(error)) {
            aborted = true;
            throw error;
          }
          item.error = this.#toZamaError(error, "Failed to decrypt delegated encrypted values", {
            isDelegated: true,
            contractAddress: item.contractAddress,
            account: getAddress(delegatorAddress),
          });
        }
      }),
      maxConcurrency,
    );

    return { items };
  }

  async #decrypt(
    handles: EncryptedInput[],
    strategy: DecryptionStrategy,
  ): Promise<Record<EncryptedValue, ClearValue>> {
    if (handles.length === 0) {
      return {};
    }

    const normalized = handles.map((h) => ({
      encryptedValue: h.encryptedValue,
      contractAddress: getAddress(h.contractAddress),
    }));
    const result: Record<EncryptedValue, ClearValue> = {};
    const nonZero: EncryptedInput[] = [];

    for (const h of normalized) {
      if (isEncryptedValueZero(h.encryptedValue)) {
        result[h.encryptedValue] = 0n;
      } else {
        nonZero.push(h);
      }
    }

    if (nonZero.length === 0) {
      return result;
    }

    const allContracts = Array.from(new Set(normalized.map((h) => h.contractAddress)));
    const nonZeroContracts = Array.from(new Set(nonZero.map((h) => h.contractAddress)));
    if (strategy.validate) {
      try {
        await strategy.validate(nonZeroContracts);
      } catch (error) {
        // The delegation pre-check makes on-chain reads too; classify a throttled
        // RPC here as well so delegated decrypt branches deterministically.
        if (isRpcRateLimitError(error)) {
          throw this.#rpcRateLimitError(error, "the delegation pre-check");
        }
        throw error;
      }
    }

    const uncached: EncryptedInput[] = [];
    for (const h of nonZero) {
      const cached = await this.#cache.get(
        strategy.requesterAddress,
        h.contractAddress,
        h.encryptedValue,
      );
      if (cached !== null) {
        result[h.encryptedValue] = cached;
      } else {
        uncached.push(h);
      }
    }

    if (uncached.length === 0) {
      return result;
    }

    const credentials = await strategy.resolveCredentials(allContracts);

    const byContract = new Map<Address, EncryptedValue[]>();
    for (const h of uncached) {
      const existing = byContract.get(h.contractAddress);
      if (existing) {
        existing.push(h.encryptedValue);
      } else {
        byContract.set(h.contractAddress, [h.encryptedValue]);
      }
    }

    const t0 = Date.now();
    const uncachedEncryptedValues = uncached.map((h) => h.encryptedValue);
    try {
      this.#emitEvent({
        type: ZamaSDKEvents.DecryptStart,
        encryptedValues: uncachedEncryptedValues,
      });

      await pLimit(
        [...byContract.entries()].map(([contractAddress, encryptedValues]) => async () => {
          // Classify per contract so a not-entitled / relayer failure carries the
          // exact contract + ACL actor (the request context the worker no longer
          // threads). Already-typed errors pass straight through.
          let decrypted: Record<EncryptedValue, ClearValue>;
          try {
            decrypted = await strategy.decryptContract({
              credentials,
              contractAddress,
              encryptedValues,
            });
          } catch (error) {
            throw wrapDecryptError(error, strategy.errorMessage, {
              isDelegated: strategy.delegated,
              contractAddress,
              account: strategy.aclActorAddress,
            });
          }

          for (const [encryptedValue, value] of Object.entries(decrypted)) {
            result[encryptedValue as EncryptedValue] = value;
            await this.#cache.set(
              strategy.requesterAddress,
              contractAddress,
              encryptedValue as EncryptedValue,
              value,
            );
          }
        }),
        5,
      );

      const uncachedResult: Record<EncryptedValue, ClearValue> = {};
      for (const encryptedValue of uncachedEncryptedValues) {
        const value = result[encryptedValue];
        if (value !== undefined) {
          uncachedResult[encryptedValue] = value;
        }
      }
      this.#emitEvent({
        type: ZamaSDKEvents.DecryptEnd,
        durationMs: Date.now() - t0,
        encryptedValues: uncachedEncryptedValues,
        result: uncachedResult,
      });
      return result;
    } catch (error) {
      // Per-contract failures are already classified into a typed ZamaError whose
      // `cause` is the original failure; surface that original in the observability
      // event so monitoring keeps the root-cause message.
      const original =
        error instanceof ZamaError && error.cause instanceof Error ? error.cause : error;
      this.#emitEvent({
        type: ZamaSDKEvents.DecryptError,
        error: toError(original),
        durationMs: Date.now() - t0,
        encryptedValues: uncachedEncryptedValues,
      });
      // The per-contract wrap above already classified these; this is a passthrough
      // for them plus a fallback for any non-contract failure (e.g. caching).
      throw wrapDecryptError(error, strategy.errorMessage, { isDelegated: strategy.delegated });
    }
  }

  /** Build an `RpcRateLimitError` for a throttled on-chain read. */
  #rpcRateLimitError(error: unknown, context: string): RpcRateLimitError {
    return new RpcRateLimitError(`RPC provider rate-limited ${context}; retry with backoff.`, {
      cause: error,
      retryAfter: extractRetryAfter(error),
    });
  }

  #setHandleResult(item: BatchDecryptItem, decrypted: Record<EncryptedValue, ClearValue>): void {
    const value = decrypted[item.encryptedValue];
    if (value === undefined) {
      item.error = new DecryptionFailedError(
        `Batch delegated decryption returned no value for encrypted value ${item.encryptedValue} on contract ${item.contractAddress}`,
      );
      return;
    }
    item.value = value;
  }

  #toZamaError(error: unknown, fallbackMessage: string, ctx?: DecryptErrorContext): ZamaError {
    return error instanceof ZamaError ? error : wrapDecryptError(error, fallbackMessage, ctx);
  }

  #missingBatchItem(): never {
    throw new DecryptionFailedError("Batch delegated decryption invariant failed: missing item");
  }

  async #assertAllDelegationsActive(
    contractAddresses: readonly Address[],
    { delegatorAddress, delegateAddress }: { delegatorAddress: Address; delegateAddress: Address },
  ): Promise<void> {
    const inactive = await this.#delegationService.findInactiveDelegations(
      contractAddresses,
      delegatorAddress,
      delegateAddress,
    );
    if (inactive.size === 0) {
      return;
    }
    for (const error of inactive.values()) {
      throw error;
    }
  }
}
