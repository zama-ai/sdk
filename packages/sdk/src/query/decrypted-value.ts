import type { Address } from "viem";
import type { ClearValueType } from "../relayer/relayer-sdk.types";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import type { DecryptHandle } from "./user-decrypt";

export interface DecryptedValueQueryConfig {
  /** The handle to read from the decrypt cache. */
  handle: DecryptHandle;
  /** The signer address used as the cache requester key. */
  signerAddress: Address;
  query?: Record<string, unknown>;
}

/**
 * Query factory for reading a single cached decrypted value.
 *
 * Pure read — never triggers a wallet signature or relayer call.
 * Returns `null` when the handle hasn't been decrypted yet.
 * Use `sdk.decrypt()` or `useUserDecrypt` to populate the cache first.
 */
export function decryptedValueQueryOptions(
  sdk: ZamaSDK,
  config: DecryptedValueQueryConfig,
): QueryFactoryOptions<
  ClearValueType | null,
  Error,
  ClearValueType | null,
  ReturnType<typeof zamaQueryKeys.decryption.handle>
> {
  return {
    queryKey: zamaQueryKeys.decryption.handle(config.handle.handle, config.handle.contractAddress),
    queryFn: () =>
      sdk.cache.get(config.signerAddress, config.handle.contractAddress, config.handle.handle),
    staleTime: Infinity,
    enabled: config.query?.enabled !== false,
  };
}
