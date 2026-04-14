import { getAddress, type Address } from "viem";
import type { CredentialsManager } from "../credentials/credentials-manager";
import type { DecryptCache } from "../decrypt-cache";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
import type { GenericSigner } from "../types";

/** A single handle paired with the contract it belongs to. */
export interface DecryptHandleEntry {
  handle: Handle;
  contractAddress: Address;
}

/** Dependencies injected into the pipeline by the caller. */
export interface UserDecryptDeps {
  signer: GenericSigner;
  credentials: CredentialsManager;
  relayer: RelayerSDK;
  cache: DecryptCache;
}

/**
 * Shared cache-aware decrypt pipeline used by both {@link ZamaSDK.userDecrypt}
 * and `Token.decryptHandles`. Centralising the logic here guarantees that all
 * non-delegated user decrypt flows share a single implementation — cache hits,
 * credential acquisition, relayer calls, and cache writes happen in the same
 * order regardless of the entry point.
 *
 * @returns A record mapping each handle to its decrypted clear-text value.
 */
export async function runUserDecryptPipeline(
  handles: DecryptHandleEntry[],
  deps: UserDecryptDeps,
): Promise<Record<Handle, ClearValueType>> {
  if (handles.length === 0) {
    return {};
  }

  const signerAddress = await deps.signer.getAddress();
  const result: Record<Handle, ClearValueType> = {};
  const uncached: DecryptHandleEntry[] = [];

  for (const h of handles) {
    const addr = getAddress(h.contractAddress);
    const cached = await deps.cache.get(signerAddress, addr, h.handle);
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
  const creds = await deps.credentials.allow(...contractAddresses);

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
    const decrypted = await deps.relayer.userDecrypt({
      handles: contractHandles,
      contractAddress,
      signedContractAddresses: creds.contractAddresses,
      privateKey: creds.privateKey,
      publicKey: creds.publicKey,
      signature: creds.signature,
      signerAddress,
      startTimestamp: creds.startTimestamp,
      durationDays: creds.durationDays,
    });

    for (const [handle, value] of Object.entries(decrypted)) {
      result[handle as Handle] = value;
      await deps.cache.set(signerAddress, contractAddress, handle as Handle, value);
    }
  }

  return result;
}
