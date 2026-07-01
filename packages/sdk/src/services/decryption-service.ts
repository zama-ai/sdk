import type { DecryptValuesReturnType } from "@fhevm/sdk/actions/decrypt";
import { getAddress, type Address } from "viem";
import type { ChainRouter } from "../chains/router";
import type { CredentialService } from "../credentials/credential-service";
import { resolvePermit } from "../credentials/decrypt-permit";
import type { ResolvedCredentials } from "../credentials/types";
import { DecryptionFailedError, isFatalBatchError, wrapDecryptError, ZamaError } from "../errors";
import type { ZamaSDKEventInput } from "../events/sdk-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { EncryptedInput } from "../query/user-decrypt";
import type { ClearValue, EncryptedValue } from "../relayer/types";
import { toError } from "../utils";
import { pLimit } from "../utils/concurrency";
import { isEncryptedValueZero } from "../utils/handles";
import type { CachingService } from "./caching-service";
import type { DelegationService } from "./delegation-service";

interface DecryptionStrategy {
  requesterAddress: Address;
  resolveCredentials: (contractAddresses: Address[]) => Promise<ResolvedCredentials>;
  validate?: (contractAddresses: readonly Address[]) => Promise<void>;
  decryptContract: (args: {
    credentials: ResolvedCredentials;
    contractAddress: Address;
    encryptedValues: EncryptedValue[];
  }) => Promise<DecryptValuesReturnType>;
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
  ): Promise<Record<EncryptedValue, ClearValue>> {
    const normalizedSigner = getAddress(signerAddress);
    return this.#decrypt(handles, {
      requesterAddress: normalizedSigner,
      resolveCredentials: (contractAddresses) =>
        this.#credentialService.grantPermit(contractAddresses),
      decryptContract: ({ credentials, contractAddress, encryptedValues }) =>
        this.#decryptValues(credentials, contractAddress, encryptedValues),
      errorMessage: "Failed to decrypt encrypted values",
    });
  }

  async delegatedDecryptValues(
    encryptedInputs: EncryptedInput[],
    delegatorAddress: Address,
    delegateAddress: Address,
    accountAddress: Address,
  ): Promise<Record<EncryptedValue, ClearValue>> {
    const normalizedDelegator = getAddress(delegatorAddress);
    const normalizedDelegate = getAddress(delegateAddress);
    return this.#decrypt(encryptedInputs, {
      requesterAddress: getAddress(accountAddress),
      resolveCredentials: (contractAddresses) =>
        this.#credentialService.grantPermit(contractAddresses, normalizedDelegator),
      validate: (contractAddresses) =>
        this.#assertAllDelegationsActive(contractAddresses, {
          delegatorAddress: normalizedDelegator,
          delegateAddress: normalizedDelegate,
        }),
      decryptContract: ({ credentials, contractAddress, encryptedValues }) =>
        this.#decryptValues(credentials, contractAddress, encryptedValues),
      errorMessage: "Failed to decrypt delegated encrypted values",
      delegated: true,
    });
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
      const decrypted = await this.delegatedDecryptValues(
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
        item.error = this.#toZamaError(error, "Failed to decrypt delegated encrypted values", true);
        return { items };
      }
    }

    await pLimit(
      items.map((item) => async () => {
        try {
          const decrypted = await this.delegatedDecryptValues(
            [{ encryptedValue: item.encryptedValue, contractAddress: item.contractAddress }],
            delegatorAddress,
            delegateAddress,
            normalizedAccount,
          );
          this.#setHandleResult(item, decrypted);
        } catch (error) {
          if (isFatalBatchError(error)) {
            throw error;
          }
          item.error = this.#toZamaError(
            error,
            "Failed to decrypt delegated encrypted values",
            true,
          );
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
    credentials: ResolvedCredentials,
    contractAddress: Address,
    encryptedValues: EncryptedValue[],
  ): Promise<DecryptValuesReturnType> {
    const permit = resolvePermit(credentials, contractAddress);
    const transportKeyPair = await this.#router.relayer.parseTransportKeyPair({
      publicKey: permit.publicKey,
      privateKey: permit.privateKey,
    });
    const signedPermit = await this.#router.relayer.parseSignedDecryptionPermit({
      transportKeyPair,
      serializedPermit: permit.serializedPermit,
    });
    return this.#router.relayer.decryptValues({
      transportKeyPair,
      signedPermit,
      encryptedValues,
      contractAddress,
    });
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
      await strategy.validate(nonZeroContracts);
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
          const decrypted = await strategy.decryptContract({
            credentials,
            contractAddress,
            encryptedValues,
          });

          // `decryptValues` returns clear values positionally aligned with the
          // requested `encryptedValues`; zip them back into the handle→value map.
          for (let i = 0; i < encryptedValues.length; i++) {
            const encryptedValue = encryptedValues[i];
            const value = decrypted[i]?.value as ClearValue | undefined;
            if (encryptedValue === undefined || value === undefined) {
              continue;
            }
            result[encryptedValue] = value;
            await this.#cache.set(
              strategy.requesterAddress,
              contractAddress,
              encryptedValue,
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
      this.#emitEvent({
        type: ZamaSDKEvents.DecryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
        encryptedValues: uncachedEncryptedValues,
      });
      throw wrapDecryptError(error, strategy.errorMessage, strategy.delegated);
    }
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

  #toZamaError(error: unknown, fallbackMessage: string, delegated = false): ZamaError {
    return error instanceof ZamaError ? error : wrapDecryptError(error, fallbackMessage, delegated);
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
