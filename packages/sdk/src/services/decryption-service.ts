import { getAddress, type Address } from "viem";
import type { CredentialService } from "../credentials/credential-service";
import {
  resolveDelegatedDecryptPermit,
  resolveUserDecryptPermit,
} from "../credentials/decrypt-permit";
import type { CredentialBundle } from "../credentials/types";
import { DecryptionFailedError, isFatalBatchError, wrapDecryptError, ZamaError } from "../errors";
import type { ZamaSDKEventInput } from "../events/sdk-events";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { DecryptHandle } from "../query/user-decrypt";
import type { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import type { ClearValueType, Handle, PublicDecryptResult } from "../relayer/relayer-sdk.types";
import { pLimit } from "../utils/concurrency";
import { isZeroHandle } from "../utils/handles";
import { toError } from "../utils";
import type { CachingService } from "./caching-service";
import type { DelegationService } from "./delegation-service";

interface DecryptionStrategy {
  requesterAddress: Address;
  resolveCredentials: (contractAddresses: Address[]) => Promise<CredentialBundle>;
  validate?: (contractAddresses: readonly Address[]) => Promise<void>;
  decryptContract: (args: {
    credentials: CredentialBundle;
    contractAddress: Address;
    contractHandles: Handle[];
  }) => Promise<Record<Handle, ClearValueType>>;
  errorMessage: string;
  delegated?: boolean;
}

export interface BatchDecryptHandleItem {
  handle: Handle;
  contractAddress: Address;
  value?: ClearValueType;
  error?: ZamaError;
}

export interface BatchDecryptHandlesResult {
  items: BatchDecryptHandleItem[];
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
    handles: DecryptHandle[],
    signerAddress: Address,
  ): Promise<Record<Handle, ClearValueType>> {
    const normalizedSigner = getAddress(signerAddress);
    return this.#decrypt(handles, {
      requesterAddress: normalizedSigner,
      resolveCredentials: (contractAddresses) => this.#credentialService.allow(contractAddresses),
      decryptContract: async ({ credentials, contractAddress, contractHandles }) => {
        return this.#relayer.userDecrypt({
          handles: contractHandles,
          contractAddress,
          ...resolveUserDecryptPermit(credentials, contractAddress),
          signerAddress: normalizedSigner,
        });
      },
      errorMessage: "Failed to decrypt handles",
    });
  }

  async delegatedUserDecrypt(
    handles: DecryptHandle[],
    delegatorAddress: Address,
    delegateAddress: Address,
    accountAddress: Address,
  ): Promise<Record<Handle, ClearValueType>> {
    const normalizedDelegator = getAddress(delegatorAddress);
    const normalizedDelegate = getAddress(delegateAddress);
    return this.#decrypt(handles, {
      requesterAddress: getAddress(accountAddress),
      resolveCredentials: (contractAddresses) =>
        this.#credentialService.allow(contractAddresses, normalizedDelegator),
      validate: (contractAddresses) =>
        this.#assertAllDelegationsActive(contractAddresses, {
          delegatorAddress: normalizedDelegator,
          delegateAddress: normalizedDelegate,
        }),
      decryptContract: async ({ credentials, contractAddress, contractHandles }) => {
        return this.#relayer.delegatedUserDecrypt({
          handles: contractHandles,
          contractAddress,
          ...resolveDelegatedDecryptPermit(credentials, contractAddress),
          delegateAddress: normalizedDelegate,
        });
      },
      errorMessage: "Failed to decrypt delegated handles",
      delegated: true,
    });
  }

  async delegatedBatchDecryptHandlesAs({
    handles,
    delegatorAddress,
    delegateAddress,
    accountAddress,
    maxConcurrency = 5,
  }: {
    handles: DecryptHandle[];
    delegatorAddress: Address;
    delegateAddress: Address;
    accountAddress: Address;
    maxConcurrency?: number;
  }): Promise<BatchDecryptHandlesResult> {
    const items: BatchDecryptHandleItem[] = handles.map((h) => ({
      handle: h.handle,
      contractAddress: getAddress(h.contractAddress),
    }));
    if (items.length === 0) {
      return { items };
    }
    const normalizedAccount = getAddress(accountAddress);

    try {
      const decrypted = await this.delegatedUserDecrypt(
        items.map(({ handle, contractAddress }) => ({ handle, contractAddress })),
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
        item.error = this.#toZamaError(error, "Failed to decrypt delegated handles", true);
        return { items };
      }
    }

    await pLimit(
      items.map((item) => async () => {
        try {
          const decrypted = await this.delegatedUserDecrypt(
            [{ handle: item.handle, contractAddress: item.contractAddress }],
            delegatorAddress,
            delegateAddress,
            normalizedAccount,
          );
          this.#setHandleResult(item, decrypted);
        } catch (error) {
          if (isFatalBatchError(error)) {
            throw error;
          }
          item.error = this.#toZamaError(error, "Failed to decrypt delegated handles", true);
        }
      }),
      maxConcurrency,
    );

    return { items };
  }

  async publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult> {
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

  async #decrypt(
    handles: DecryptHandle[],
    strategy: DecryptionStrategy,
  ): Promise<Record<Handle, ClearValueType>> {
    if (handles.length === 0) {
      return {};
    }

    const normalized = handles.map((h) => ({
      handle: h.handle,
      contractAddress: getAddress(h.contractAddress),
    }));
    const result: Record<Handle, ClearValueType> = {};
    const nonZero: DecryptHandle[] = [];

    for (const h of normalized) {
      if (isZeroHandle(h.handle)) {
        result[h.handle] = 0n;
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

    const uncached: DecryptHandle[] = [];
    for (const h of nonZero) {
      const cached = await this.#cache.get(strategy.requesterAddress, h.contractAddress, h.handle);
      if (cached !== null) {
        result[h.handle] = cached;
      } else {
        uncached.push(h);
      }
    }

    if (uncached.length === 0) {
      return result;
    }

    const credentials = await strategy.resolveCredentials(allContracts);

    const byContract = new Map<Address, Handle[]>();
    for (const h of uncached) {
      const existing = byContract.get(h.contractAddress);
      if (existing) {
        existing.push(h.handle);
      } else {
        byContract.set(h.contractAddress, [h.handle]);
      }
    }

    const t0 = Date.now();
    const uncachedHandles = uncached.map((h) => h.handle);
    try {
      this.#emitEvent({
        type: ZamaSDKEvents.DecryptStart,
        handles: uncachedHandles,
      });

      await pLimit(
        [...byContract.entries()].map(([contractAddress, contractHandles]) => async () => {
          const decrypted = await strategy.decryptContract({
            credentials,
            contractAddress,
            contractHandles,
          });

          for (const [handle, value] of Object.entries(decrypted)) {
            result[handle as Handle] = value;
            await this.#cache.set(
              strategy.requesterAddress,
              contractAddress,
              handle as Handle,
              value,
            );
          }
        }),
        5,
      );

      const uncachedResult: Record<Handle, ClearValueType> = {};
      for (const handle of uncachedHandles) {
        const value = result[handle];
        if (value !== undefined) {
          uncachedResult[handle] = value;
        }
      }
      this.#emitEvent({
        type: ZamaSDKEvents.DecryptEnd,
        durationMs: Date.now() - t0,
        handles: uncachedHandles,
        result: uncachedResult,
      });
      return result;
    } catch (error) {
      this.#emitEvent({
        type: ZamaSDKEvents.DecryptError,
        error: toError(error),
        durationMs: Date.now() - t0,
        handles: uncachedHandles,
      });
      throw wrapDecryptError(error, strategy.errorMessage, strategy.delegated);
    }
  }

  #setHandleResult(item: BatchDecryptHandleItem, decrypted: Record<Handle, ClearValueType>): void {
    const value = decrypted[item.handle];
    if (value === undefined) {
      item.error = new DecryptionFailedError(
        `Batch delegated decryption returned no value for handle ${item.handle} on contract ${item.contractAddress}`,
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
    {
      delegatorAddress,
      delegateAddress,
    }: {
      delegatorAddress: Address;
      delegateAddress: Address;
    },
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
