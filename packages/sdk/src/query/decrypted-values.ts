import type { Address } from "viem";
import type { ClearValueType, Handle } from "../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import type { DecryptHandle } from "./user-decrypt";

/** A map of handles to their cached decrypted values (null = not yet decrypted). */
export type DecryptedValuesResult = Record<Handle, ClearValueType | null>;

export interface DecryptedValuesQueryConfig {
  /** The handles to read from the decrypt cache. */
  handles: DecryptHandle[];
  /** The signer address used as the cache requester key. */
  signerAddress: Address;
  query?: { enabled?: boolean };
}

/**
 * Query factory for reading multiple cached decrypted values in one query.
 *
 * Pure read — never triggers a wallet signature or relayer call.
 * Returns a record mapping each handle to its cached value or `null`.
 * Use `sdk.decrypt()` or `useUserDecrypt` to populate the cache first.
 */
export function decryptedValuesQueryOptions(
  sdk: ZamaSDK,
  config: DecryptedValuesQueryConfig,
): QueryFactoryOptions<
  DecryptedValuesResult,
  Error,
  DecryptedValuesResult,
  ReturnType<typeof zamaQueryKeys.decryption.handles>
> {
  return {
    queryKey: zamaQueryKeys.decryption.handles(config.handles),
    queryFn: async () => {
      const result: DecryptedValuesResult = {};
      for (const h of config.handles) {
        result[h.handle] = await sdk.cache.get(config.signerAddress, h.contractAddress, h.handle);
      }
      return result;
    },
    staleTime: Infinity,
    enabled: config.query?.enabled !== false,
  };
}
