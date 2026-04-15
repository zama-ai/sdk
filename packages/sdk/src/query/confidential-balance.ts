import type { Handle } from "../relayer/relayer-sdk.types";

import type { Address } from "viem";
import { DecryptionFailedError } from "../errors";
import { assertBigint, assertNonNullable } from "../utils/assertions";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";

export type EncryptedBalanceHandle = Handle;

export interface ConfidentialBalanceQueryConfig {
  tokenAddress: Address;
  owner?: Address;
  handle?: EncryptedBalanceHandle;
  query?: Record<string, unknown>;
}

export function confidentialBalanceQueryOptions(
  sdk: ZamaSDK,
  config: ConfidentialBalanceQueryConfig,
): QueryFactoryOptions<
  bigint,
  Error,
  bigint,
  ReturnType<typeof zamaQueryKeys.confidentialBalance.owner>
> {
  const { tokenAddress, owner, handle, query = {} } = config;

  const queryEnabled = query?.enabled !== false;
  const queryKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, owner, handle);

  return {
    ...filterQueryOptions(query),
    queryKey,
    queryFn: async (context) => {
      const [, { owner: keyOwner, handle: keyHandle }] = context.queryKey;
      assertNonNullable(keyOwner, "confidentialBalanceQueryOptions: owner");
      assertNonNullable(keyHandle, "confidentialBalanceQueryOptions: handle");
      const decrypted = await sdk.userDecrypt([
        { handle: keyHandle, contractAddress: tokenAddress },
      ]);
      const value = decrypted[keyHandle];
      if (value === undefined) {
        throw new DecryptionFailedError(`Decryption returned no value for handle ${keyHandle}`);
      }
      assertBigint(value, "confidentialBalanceQueryOptions: result[handle]");
      return value;
    },
    enabled: Boolean(owner && handle && queryEnabled),
    staleTime: Infinity,
  };
}
