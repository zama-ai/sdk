import { getAddress, type Address } from "viem";
import type { DecryptHandleEntry } from "./user-decrypt-pipeline";
import { runCachePartitionPipeline } from "./cache-partition-pipeline";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { DelegatedCredentialsManager } from "../credentials/delegated-credentials-manager";
import type { DecryptCache } from "../decrypt-cache";
import { DecryptionFailedError } from "../errors";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
import { runGroupByContractPipeline } from "./group-by-contract-pipeline";

export interface DelegatedDecryptArgs {
  handles: DecryptHandleEntry[];
  delegatorAddress: Address;
  ownerAddress?: Address;
}

/** Dependencies for delegated decryption. */
export interface DelegatedDecryptDeps {
  delegatedCredentials: DelegatedCredentialsManager;
  relayer: RelayerSDK;
  cache: DecryptCache;
}

/**
 * Cache-aware delegated decrypt pipeline. Mirrors {@link runUserDecryptPipeline}
 * but uses delegated credentials and `relayer.delegatedUserDecrypt`.
 */
export async function runDelegatedDecryptPipeline(
  args: DelegatedDecryptArgs,
  deps: DelegatedDecryptDeps,
): Promise<Record<Handle, ClearValueType>> {
  const { handles, delegatorAddress, ownerAddress = delegatorAddress } = args;
  if (handles.length === 0) {
    return {};
  }

  const { result, uncached } = await runCachePartitionPipeline({ handles, ownerAddress }, deps);

  if (uncached.length === 0) {
    return result;
  }

  const allContractAddresses = [...new Set(handles.map((h) => getAddress(h.contractAddress)))];
  const creds = await deps.delegatedCredentials.allow(delegatorAddress, ...allContractAddresses);

  const byContract = runGroupByContractPipeline(uncached);

  for (const [contractAddress, contractHandles] of byContract) {
    const decrypted = await deps.relayer.delegatedUserDecrypt({
      handles: contractHandles,
      contractAddress,
      signedContractAddresses: creds.contractAddresses,
      privateKey: creds.privateKey,
      publicKey: creds.publicKey,
      signature: creds.signature,
      delegatorAddress: creds.delegatorAddress,
      delegateAddress: creds.delegateAddress,
      startTimestamp: creds.startTimestamp,
      durationDays: creds.durationDays,
    });

    for (const [handle, value] of Object.entries(decrypted)) {
      result[handle as Handle] = value;
      try {
        await deps.cache.set(ownerAddress, contractAddress, handle as Handle, value);
      } catch {
        // Cache writes are best-effort — DecryptCache.set logs internally.
      }
    }
  }

  for (const h of uncached) {
    if (!(h.handle in result)) {
      throw new DecryptionFailedError(
        `Relayer returned no value for handle ${h.handle} on contract ${h.contractAddress}`,
      );
    }
  }

  return result;
}
