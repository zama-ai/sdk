import type { ReadonlyToken } from "../token/readonly-token";
import type { Handle } from "../relayer/relayer-sdk.types";

import { DecryptionFailedError } from "../errors";
import { assertBigint, assertNonNullable } from "../utils/assertions";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";
import type { Address } from "viem";

export type EncryptedBalanceHandle = Handle;

export interface ConfidentialBalanceQueryConfig {
  owner?: Address;
  handle?: EncryptedBalanceHandle;
  query?: Record<string, unknown>;
}

export function confidentialBalanceQueryOptions(
  token: ReadonlyToken,
  config?: ConfidentialBalanceQueryConfig,
): QueryFactoryOptions<
  bigint,
  Error,
  bigint,
  ReturnType<typeof zamaQueryKeys.confidentialBalance.owner>
> {
  const ownerKey = config?.owner;
  const handleKey = config?.handle;
  const queryEnabled = config?.query?.enabled !== false;
  const queryKey = zamaQueryKeys.confidentialBalance.owner(token.address, ownerKey, handleKey);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { owner: keyOwner, handle: keyHandle }] = context.queryKey;
      assertNonNullable(keyOwner, "confidentialBalanceQueryOptions: owner");
      assertNonNullable(keyHandle, "confidentialBalanceQueryOptions: handle");
      const decrypted = await token.sdk.userDecrypt([
        { handle: keyHandle, contractAddress: token.address },
      ]);
      const value = decrypted[keyHandle];
      if (value === undefined) {
        throw new DecryptionFailedError(`Decryption returned no value for handle ${keyHandle}`);
      }
      assertBigint(value, "confidentialBalanceQueryOptions: result[handle]");
      return value;
    },
    enabled: Boolean(ownerKey && handleKey) && queryEnabled,
    staleTime: Infinity,
  };
}
