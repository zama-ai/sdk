import { getAddress, type Address } from "viem";
import type { CredentialsManager } from "../credentials/credentials-manager";
import type { DecryptCache } from "../decrypt-cache";
import { DecryptionFailedError } from "../errors";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
import { pLimit } from "../token/concurrency";
import type { GenericSigner } from "../types";
import { runCachePartitionPipeline } from "./cache-partition-pipeline";
import { runGroupByContractPipeline } from "./group-by-contract-pipeline";

/** Maximum concurrent relayer calls per pipeline invocation. */
const DECRYPT_CONCURRENCY = 5;

/** 32-byte zero handle, used to detect uninitialized encrypted balances. */
const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

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
 * Cache-aware user-decrypt pipeline.
 *
 * Stages: zero-handle filter → cache lookup → credentials.allow(fullSet) →
 * relayer calls with bounded parallelism → cache write → verify completeness.
 *
 * The contract address set passed to `credentials.allow` is derived from ALL
 * input handles (before cache filtering) so the `createKey` is stable
 * regardless of cache state.
 *
 * @returns A record mapping each handle to its decrypted clear-text value.
 */
export async function runUserDecryptPipeline(
  handles: DecryptHandleEntry[],
  deps: UserDecryptDeps,
): Promise<Record<Handle, ClearValueType>> {
  const { signer, credentials, relayer, cache } = deps;

  if (handles.length === 0) {
    return {};
  }

  let result: Record<Handle, ClearValueType> = {};
  const nonZero: DecryptHandleEntry[] = [];

  for (const h of handles) {
    if (h.handle === ZERO_HANDLE || h.handle === "0x") {
      result[h.handle] = 0n;
    } else {
      nonZero.push({
        handle: h.handle,
        contractAddress: getAddress(h.contractAddress),
      });
    }
  }

  if (nonZero.length === 0) {
    return result;
  }

  const signerAddress = await signer.getAddress();
  const { result: cached, uncached } = await runCachePartitionPipeline(
    { handles: nonZero, ownerAddress: signerAddress },
    { cache },
  );
  result = { ...result, ...cached };

  if (uncached.length === 0) {
    return result;
  }

  const allContractAddresses = [...new Set(handles.map((h) => getAddress(h.contractAddress)))];
  const creds = await credentials.allow(...allContractAddresses);

  const byContract = runGroupByContractPipeline(uncached);

  await pLimit(
    [...byContract.entries()].map(([contractAddress, contractHandles]) => async () => {
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
          // best-effort
        }
      }
    }),
    DECRYPT_CONCURRENCY,
  );

  for (const h of uncached) {
    if (!(h.handle in result)) {
      throw new DecryptionFailedError(
        `Decryption returned no value for handle ${h.handle} on contract ${h.contractAddress}`,
      );
    }
  }

  return result;
}
