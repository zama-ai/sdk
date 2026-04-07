"use client";

import { skipToken } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import type { DecryptHandle, DecryptResult } from "@zama-fhe/sdk/query";
import {
  isAllowedQueryOptions,
  signerAddressQueryOptions,
  userDecryptQueryOptions,
  zamaQueryKeys,
} from "@zama-fhe/sdk/query";
import { useZamaSDK } from "../provider";
import { useQuery } from "../utils/query";

/** Configuration for {@link useUserDecrypt}. */
export interface UseUserDecryptConfig {
  /** The handles to decrypt. */
  handles: DecryptHandle[];
  /** Pass `{ enabled: false }` to disable the query. */
  query?: { enabled?: boolean };
}

/**
 * React hook for FHE user decryption. Follows react-query `useQuery` semantics.
 *
 * Automatically fires when credentials are available (acquired via `useAllow`)
 * and handles are provided. Checks the persistent cache first and only hits the
 * relayer for uncached handles.
 *
 * Call `useAllow().mutate([contractAddress])` first to acquire credentials
 * (triggers a one-time wallet signature). Once allowed, this hook decrypts
 * the provided handles automatically.
 *
 * @param config - Handles to decrypt and optional query config.
 *
 * @example
 * ```tsx
 * const { mutate: allow } = useAllow();
 * const { data, isPending } = useUserDecrypt({
 *   handles: [{ handle: "0xHandle", contractAddress: "0xContract" }],
 * });
 *
 * // First: authorize decryption (triggers wallet signature once)
 * <button onClick={() => allow(["0xContract"])}>Allow</button>
 *
 * // Then: decrypted values appear automatically
 * <span>{data?.["0xHandle"]?.toString() ?? "pending"}</span>
 * ```
 */
export function useUserDecrypt(config: UseUserDecryptConfig) {
  const sdk = useZamaSDK();

  const addressQuery = useQuery<Address>(signerAddressQueryOptions(sdk.signer));
  const signerAddress = addressQuery.data;
  const contractAddresses = [...new Set(config.handles.map((h) => h.contractAddress))];

  const allowedOpts = signerAddress
    ? isAllowedQueryOptions(sdk, { account: signerAddress, contractAddresses })
    : ({
        queryKey: zamaQueryKeys.isAllowed.all,
        queryFn: skipToken,
        enabled: false,
      } as const);
  const allowedQuery = useQuery<boolean>(allowedOpts);
  const isAllowed = allowedQuery.data === true;

  return useQuery<DecryptResult>(
    userDecryptQueryOptions(sdk, {
      handles: config.handles,
      query: { enabled: isAllowed && config.query?.enabled !== false },
    }),
  );
}

/** Return type of {@link useUserDecrypt}. */
export type UseUserDecryptResult = ReturnType<typeof useUserDecrypt>;
