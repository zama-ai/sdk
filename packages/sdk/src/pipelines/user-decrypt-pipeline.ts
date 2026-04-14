import { getAddress, type Address } from "viem";
import type { CredentialsManager } from "../credentials/credentials-manager";
import type { DecryptCache } from "../decrypt-cache";
import { DecryptionFailedError } from "../errors";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
import type { GenericSigner } from "../types";
import { runCachePartitionPipeline } from "./cache-partition-pipeline";
import { runGroupByContractPipeline } from "./group-by-contract-pipeline";

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

/** Lifecycle callbacks fired at specific pipeline stages. */
export interface UserDecryptOptions {
  /** Fired after credentials are acquired, before relayer round-trips. Not called when all handles are cached. */
  onCredentialsReady?: () => void;
  /** Fired after all handles have been decrypted (including cache-only results). */
  onDecrypted?: (values: Record<Handle, ClearValueType>) => void;
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
  options?: UserDecryptOptions,
): Promise<Record<Handle, ClearValueType>> {
  const { signer, credentials, relayer, cache } = deps;
  const { onCredentialsReady = () => {}, onDecrypted = () => {} } = options ?? {};

  if (handles.length === 0) {
    return {};
  }

  const signerAddress = await signer.getAddress();
  const { result, uncached } = await runCachePartitionPipeline(
    { handles, ownerAddress: signerAddress },
    deps,
  );

  if (uncached.length === 0) {
    onDecrypted?.(result);
    return result;
  }

  const allContractAddresses = [...new Set(handles.map((h) => getAddress(h.contractAddress)))];
  const creds = await credentials.allow(...allContractAddresses);
  onCredentialsReady?.();
  const byContract = runGroupByContractPipeline(uncached);

  for (const [contractAddress, contractHandles] of byContract) {
    const decrypted = await relayer.userDecrypt({
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
      try {
        await cache.set(signerAddress, contractAddress, handle as Handle, value);
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

  onDecrypted?.(result);
  return result;
}
