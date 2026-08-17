import type { ParseTransportKeyPairReturnType } from "@fhevm/sdk/actions/chain";
import type { DecryptValuesReturnType } from "@fhevm/sdk/actions/decrypt";
import { getAddress, type Address } from "viem";
import type { ChainRouter } from "../chains/router";
import type { CredentialService } from "../credentials/credential-service";
import { resolvePermit } from "../credentials/decrypt-permit";
import type { SerializedTransportKeyPairWithPermissions } from "../credentials/types";
import {
  type DecryptErrorContext,
  DecryptionFailedError,
  DelegationNotPropagatedError,
  isFatalBatchError,
  RevokedKmsContextError,
  RpcRateLimitError,
  wrapDecryptError,
  ZamaError,
} from "../errors";
import type { ZamaSDKEventInput } from "../events/sdk-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { EncryptedInput } from "../query/user-decrypt";
import type { ClearValue, EncryptedValue, FhevmRelayerOptions } from "../relayer/types";
import { pLimit } from "../utils/concurrency";
import { chunkHandlesByBitBudget, isEncryptedValueZero } from "../utils/handles";
import {
  extractRetryAfter,
  isInvalidTransportKeyPairMessage,
  isRpcRateLimitError,
  toError,
} from "../utils";
import type { CachingService } from "./caching-service";
import type { DelegationService } from "./delegation-service";

/**
 * How long the delegated-decrypt path keeps retrying while a freshly granted
 * delegation propagates to the gateway. Propagation usually completes within
 * ~10 blocks (a few seconds); this ceiling absorbs a briefly lagging gateway
 * without turning a genuine outage into a long hang.
 */
const DELEGATION_PROPAGATION_RETRY_BUDGET_MS = 30_000;
/** Delay between propagation retries. */
const DELEGATION_PROPAGATION_RETRY_INTERVAL_MS = 2_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Options shared by the delegated-decrypt entry points. */
export interface DelegatedDecryptOptions {
  /**
   * Ride out the gateway propagation window: when a just-granted delegation
   * has not yet synced, the delegated decrypt is retried (bounded, ~30s) until
   * it lands instead of throwing {@link DelegationNotPropagatedError}. Defaults
   * to `true`. Pass `false` to fail fast on the first not-propagated response.
   */
  waitForPropagation?: boolean;
}

interface DecryptionStrategy {
  requesterAddress: Address;
  /**
   * Delegator whose permit scope this decrypt reads; undefined on the direct
   * path. The single delegation discriminator: it also selects the delegated
   * error classification and the ACL actor (delegator, or the requester when
   * direct).
   */
  delegator?: Address;
  validate?: (contractAddresses: readonly Address[]) => Promise<void>;
  errorMessage: string;
}

/** One decrypt-relayer request: a contract's handles chunked to the bit budget. */
interface DecryptRequest {
  contractAddress: Address;
  encryptedValues: EncryptedValue[];
}

/** Tracks the evict-and-regrant allowance across retried decrypt attempts. */
interface RecoveryBudget {
  spent: boolean;
}

/** Per-handle outcome of a batch decrypt: the decrypted value, or a per-item error. */
export interface BatchDecryptItem {
  /** The encrypted value (handle) being decrypted. */
  encryptedValue: EncryptedValue;
  /** Address of the contract the handle belongs to. */
  contractAddress: Address;
  /** Decrypted clear value; set when this item succeeded. */
  value?: ClearValue;
  /** Error for this item; set when this item failed. */
  error?: ZamaError;
}

/** Result of a batch decrypt: one entry per requested handle, in input order. */
export interface BatchDecryptResult {
  /** Per-handle outcomes. */
  items: BatchDecryptItem[];
}

/** @internal */
export class DecryptionService {
  readonly #cache: CachingService;
  readonly #credentialService: CredentialService;
  readonly #delegationService: DelegationService;
  readonly #router: ChainRouter;
  readonly #emitEvent: (input: ZamaSDKEventInput) => void;

  constructor({
    cache,
    credentialService,
    delegationService,
    router,
    emitEvent,
  }: {
    cache: CachingService;
    credentialService: CredentialService;
    delegationService: DelegationService;
    router: ChainRouter;
    emitEvent: (input: ZamaSDKEventInput) => void;
  }) {
    this.#cache = cache;
    this.#credentialService = credentialService;
    this.#delegationService = delegationService;
    this.#router = router;
    this.#emitEvent = emitEvent;
  }

  async decryptValues(
    handles: EncryptedInput[],
    signerAddress: Address,
    opts?: Pick<FhevmRelayerOptions, "signal" | "timeout">,
  ): Promise<Record<EncryptedValue, ClearValue>> {
    const normalizedSigner = getAddress(signerAddress);
    return this.#decrypt(
      handles,
      { requesterAddress: normalizedSigner, errorMessage: "Failed to decrypt encrypted values" },
      opts,
    );
  }

  async delegatedDecryptValues(
    encryptedInputs: EncryptedInput[],
    delegatorAddress: Address,
    delegateAddress: Address,
    accountAddress: Address,
    opts?: DelegatedDecryptOptions,
  ): Promise<Record<EncryptedValue, ClearValue>> {
    const normalizedDelegator = getAddress(delegatorAddress);
    const normalizedDelegate = getAddress(delegateAddress);
    // One evict-and-regrant across the whole propagation-retry loop, not one
    // per attempt: each retry would otherwise re-arm the recovery and spend a
    // fresh wallet prompt per 2s attempt while the upstream validity cache
    // keeps serving the revoked context.
    const recovery: RecoveryBudget = { spent: false };
    return this.#withPropagationRetry(opts?.waitForPropagation ?? true, () =>
      this.#decrypt(
        encryptedInputs,
        {
          requesterAddress: getAddress(accountAddress),
          delegator: normalizedDelegator,
          validate: (contractAddresses) =>
            this.#assertAllDelegationsActive(contractAddresses, {
              delegatorAddress: normalizedDelegator,
              delegateAddress: normalizedDelegate,
            }),
          errorMessage: "Failed to decrypt delegated encrypted values",
        },
        undefined,
        recovery,
      ),
    );
  }

  /**
   * Absorb the gateway propagation window on the delegated path: retry `attempt`
   * (bounded by {@link DELEGATION_PROPAGATION_RETRY_BUDGET_MS}) while it fails
   * with a transient {@link DelegationNotPropagatedError}. Every other error —
   * including a missing/expired grant surfaced by the pre-check — throws
   * immediately, and passing `waitForPropagation: false` disables the retry so
   * the first not-propagated response propagates unchanged.
   */
  async #withPropagationRetry<T>(
    waitForPropagation: boolean,
    attempt: () => Promise<T>,
  ): Promise<T> {
    // Fixed-interval polling across the budget: e.g. 30s / 2s = 15 gaps, so 16
    // attempts. Bounded (no open-ended loop) and deterministic under fake timers.
    const maxAttempts =
      Math.floor(
        DELEGATION_PROPAGATION_RETRY_BUDGET_MS / DELEGATION_PROPAGATION_RETRY_INTERVAL_MS,
      ) + 1;
    let lastError: unknown;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        return await attempt();
      } catch (error) {
        lastError = error;
        const canRetry =
          i < maxAttempts - 1 &&
          waitForPropagation &&
          error instanceof DelegationNotPropagatedError;
        if (!canRetry) {
          throw error;
        }
        await sleep(DELEGATION_PROPAGATION_RETRY_INTERVAL_MS);
      }
    }
    throw lastError;
  }

  async delegatedBatchDecryptHandlesAs({
    encryptedInputs,
    delegatorAddress,
    delegateAddress,
    accountAddress,
    maxConcurrency = 5,
    waitForPropagation = true,
  }: {
    encryptedInputs: EncryptedInput[];
    delegatorAddress: Address;
    delegateAddress: Address;
    accountAddress: Address;
    maxConcurrency?: number;
    waitForPropagation?: boolean;
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
      const decrypted = await this.delegatedDecryptValues(
        items.map(({ encryptedValue, contractAddress }) => ({ encryptedValue, contractAddress })),
        delegatorAddress,
        delegateAddress,
        normalizedAccount,
        { waitForPropagation },
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
          // The batch attempt above already rode out the propagation window for
          // the whole set; fail fast here so a still-unsynced delegation records
          // a per-item error instead of each item re-spending the full budget.
          const decrypted = await this.delegatedDecryptValues(
            [{ encryptedValue: item.encryptedValue, contractAddress: item.contractAddress }],
            delegatorAddress,
            delegateAddress,
            normalizedAccount,
            { waitForPropagation: false },
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

  /**
   * Run a user (or delegated-user) decrypt for one contract: rebuild the
   * `@fhevm/sdk` transport key pair and signed permit from the resolved permit,
   * then decrypt. The delegation, if any, is encoded in the permit — both paths
   * share this call. Returns the positional clear values for `encryptedValues`.
   */
  async #decryptValues(
    credentials: SerializedTransportKeyPairWithPermissions,
    contractAddress: Address,
    encryptedValues: EncryptedValue[],
    options?: Pick<FhevmRelayerOptions, "signal" | "timeout">,
  ): Promise<DecryptValuesReturnType> {
    const permit = resolvePermit(credentials, contractAddress);
    let transportKeyPair: ParseTransportKeyPairReturnType;
    try {
      transportKeyPair = await this.#router.relayer.parseTransportKeyPair({
        publicKey: permit.publicKey,
        privateKey: permit.privateKey,
        tkmsVersion: credentials.keypair.tkmsVersion,
      });
    } catch (error) {
      // Stale key pair the relayer can't re-derive (post KMS/TKMS rotation):
      // evict it so the next resolveCredentials regenerates and re-signs.
      // wrapDecryptError maps the raw message to InvalidTransportKeyPairError.
      if (error instanceof Error && isInvalidTransportKeyPairMessage(error.message)) {
        await this.#credentialService.evictTransportKeyPair();
      }
      throw error;
    }
    const signedPermit = await this.#router.relayer.parseSignedDecryptionPermit({
      transportKeyPair,
      serializedPermit: permit.serializedPermit,
    });
    return this.#router.relayer.decryptValues({
      transportKeyPair,
      signedPermit,
      encryptedValues,
      contractAddress,
      options,
    });
  }

  async #decrypt(
    handles: EncryptedInput[],
    strategy: DecryptionStrategy,
    options?: Pick<FhevmRelayerOptions, "signal" | "timeout">,
    recovery: RecoveryBudget = { spent: false },
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

    let credentials = await this.#credentialService.grantPermit(allContracts, strategy.delegator);

    const byContract = new Map<Address, EncryptedValue[]>();
    for (const h of uncached) {
      const existing = byContract.get(h.contractAddress);
      if (existing) {
        existing.push(h.encryptedValue);
      } else {
        byContract.set(h.contractAddress, [h.encryptedValue]);
      }
    }

    // Split each contract's handles to stay under the relayer's per-request
    // cleartext-bit budget — a contract with many/wide handles becomes
    // several relayer calls instead of one oversized, rejected call.
    const requests: DecryptRequest[] = [];
    for (const [contractAddress, encryptedValues] of byContract) {
      for (const chunk of chunkHandlesByBitBudget(encryptedValues)) {
        requests.push({ contractAddress, encryptedValues: chunk });
      }
    }

    const t0 = Date.now();
    const uncachedEncryptedValues = uncached.map((h) => h.encryptedValue);
    try {
      this.#emitEvent({
        type: ZamaSDKEvents.DecryptStart,
        encryptedValues: uncachedEncryptedValues,
      });

      try {
        await this.#runDecryptRequests(strategy, credentials, requests, result, options);
      } catch (error) {
        if (!(error instanceof RevokedKmsContextError) || recovery.spent) {
          throw error;
        }
        // The permit's KMS context was revoked: every permit signed under it
        // is permanently dead, so re-grant under the current context (one
        // wallet prompt, shared across concurrent decrypt calls) and retry the
        // still-unresolved chunks once. The budget is marked spent before
        // awaiting so a failure in the re-grant cannot re-arm it, and it is
        // shared across the delegated propagation-retry loop: a second revoked
        // failure surfaces, because the upstream validity check caches a stale
        // "valid" verdict for up to 15 minutes and looping would only re-hit it.
        recovery.spent = true;
        credentials = await this.#credentialService.recoverPermits(
          allContracts,
          strategy.delegator,
        );
        await this.#runDecryptRequests(
          strategy,
          credentials,
          requests.filter(({ encryptedValues }) =>
            encryptedValues.some((encryptedValue) => result[encryptedValue] === undefined),
          ),
          result,
          options,
        );
      }

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
      throw wrapDecryptError(error, strategy.errorMessage, {
        isDelegated: strategy.delegator !== undefined,
      });
    }
  }

  /**
   * Fan the decrypt requests out (bounded concurrency), writing clear values
   * into `result` and the cache as each settles. Every request is settled
   * before anything is thrown: pLimit rejects on the first settled failure
   * while siblings are still in flight, which would let a sibling's earlier
   * failure hide a revoked-context revert from the recovery decision and let
   * the retry race workers still writing into `result`. Among the settled
   * failures, a {@link RevokedKmsContextError} is surfaced in preference to
   * whichever happened to settle first, so the self-heal always sees it.
   */
  async #runDecryptRequests(
    strategy: DecryptionStrategy,
    credentials: SerializedTransportKeyPairWithPermissions,
    requests: DecryptRequest[],
    result: Record<EncryptedValue, ClearValue>,
    options?: Pick<FhevmRelayerOptions, "signal" | "timeout">,
  ): Promise<void> {
    const outcomes = await pLimit(
      requests.map(({ contractAddress, encryptedValues }) => async (): Promise<unknown> => {
        try {
          await this.#decryptRequest(
            strategy,
            credentials,
            contractAddress,
            encryptedValues,
            result,
            options,
          );
          return undefined;
        } catch (error) {
          return error;
        }
      }),
      5,
    );
    const failures = outcomes.filter((outcome) => outcome !== undefined);
    if (failures.length > 0) {
      throw failures.find((failure) => failure instanceof RevokedKmsContextError) ?? failures[0];
    }
  }

  /** Decrypt one contract's chunk of handles into `result` (and the cache). */
  async #decryptRequest(
    strategy: DecryptionStrategy,
    credentials: SerializedTransportKeyPairWithPermissions,
    contractAddress: Address,
    encryptedValues: EncryptedValue[],
    result: Record<EncryptedValue, ClearValue>,
    options?: Pick<FhevmRelayerOptions, "signal" | "timeout">,
  ): Promise<void> {
    // Classify per contract so a not-entitled / relayer failure carries the
    // exact contract + ACL actor. Already-typed errors pass straight through.
    let decrypted: DecryptValuesReturnType;
    try {
      decrypted = await this.#decryptValues(credentials, contractAddress, encryptedValues, options);
    } catch (error) {
      throw wrapDecryptError(error, strategy.errorMessage, {
        isDelegated: strategy.delegator !== undefined,
        contractAddress,
        account: strategy.delegator ?? strategy.requesterAddress,
      });
    }

    // `decryptValues` returns clear values positionally aligned with the
    // requested `encryptedValues`; zip them back into the handle→value map.
    for (let i = 0; i < encryptedValues.length; i++) {
      const encryptedValue = encryptedValues[i];
      const value = decrypted[i]?.value;
      if (encryptedValue === undefined || value === undefined) {
        continue;
      }
      result[encryptedValue] = value;
      await this.#cache.set(strategy.requesterAddress, contractAddress, encryptedValue, value);
    }

    const missing = encryptedValues.filter(
      (encryptedValue) => result[encryptedValue] === undefined,
    );
    if (missing.length > 0) {
      throw new DecryptionFailedError(
        `${strategy.errorMessage}: relayer returned no clear value for ${missing.length} of ${encryptedValues.length} handle(s) on ${contractAddress}`,
        {
          cause: new AggregateError(
            missing.map(
              (encryptedValue) =>
                new DecryptionFailedError(
                  `No clear value for handle ${encryptedValue} on ${contractAddress}`,
                ),
            ),
            `${missing.length} handle(s) missing a clear value on ${contractAddress}`,
          ),
        },
      );
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
