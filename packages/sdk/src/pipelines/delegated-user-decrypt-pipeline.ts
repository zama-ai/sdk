import { getAddress, type Address } from "viem";
import type { DecryptHandleEntry } from "./user-decrypt-pipeline";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { DelegatedCredentialsManager } from "../credentials/delegated-credentials-manager";
import type { DecryptCache } from "../decrypt-cache";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";

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
  {
    handles,
    delegatorAddress,
    ownerAddress = delegatorAddress,
  }: {
    handles: DecryptHandleEntry[];
    delegatorAddress: Address;
    ownerAddress?: Address;
  },
  deps: DelegatedDecryptDeps,
): Promise<Record<Handle, ClearValueType>> {
  if (handles.length === 0) {
    return {};
  }

  const result: Record<Handle, ClearValueType> = {};
  const uncached: DecryptHandleEntry[] = [];

  for (const h of handles) {
    const addr = getAddress(h.contractAddress);
    const cached = await deps.cache.get(ownerAddress, addr, h.handle);
    if (cached !== null) {
      result[h.handle] = cached;
    } else {
      uncached.push({ handle: h.handle, contractAddress: addr });
    }
  }

  if (uncached.length === 0) {
    return result;
  }

  const contractAddresses = [...new Set(uncached.map((h) => h.contractAddress))];
  const creds = await deps.delegatedCredentials.allow(delegatorAddress, ...contractAddresses);

  const byContract = new Map<Address, Handle[]>();
  for (const h of uncached) {
    const existing = byContract.get(h.contractAddress);
    if (existing) {
      existing.push(h.handle);
    } else {
      byContract.set(h.contractAddress, [h.handle]);
    }
  }

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
      await deps.cache.set(ownerAddress, contractAddress, handle as Handle, value);
    }
  }

  return result;
}
