import type { ReadonlyToken } from "../token/readonly-token";
import type { Address } from "viem";
import { MAX_UINT64 } from "../contracts";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";

export interface DelegationStatusData {
  isDelegated: boolean;
  expiryTimestamp: bigint;
}

export interface DelegationStatusQueryConfig {
  delegatorAddress: Address;
  delegateAddress: Address;
  query?: Record<string, unknown>;
}

export function delegationStatusQueryOptions(
  readonlyToken: ReadonlyToken,
  config: DelegationStatusQueryConfig,
): QueryFactoryOptions<
  DelegationStatusData,
  Error,
  DelegationStatusData,
  ReturnType<typeof zamaQueryKeys.delegationStatus.scope>
> {
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey: zamaQueryKeys.delegationStatus.scope(
      readonlyToken.address,
      config.delegatorAddress,
      config.delegateAddress,
    ),
    queryFn: async (context) => {
      const [, { delegatorAddress, delegateAddress }] = context.queryKey;
      const expiryTimestamp = await readonlyToken.getDelegationExpiry({
        delegatorAddress,
        delegateAddress,
      });
      // Derive isDelegated from expiry + chain time to stay consistent
      // with ReadonlyToken.isDelegated() (avoids client-clock skew).
      let isDelegated: boolean;
      if (expiryTimestamp === 0n) {
        isDelegated = false;
      } else if (expiryTimestamp === MAX_UINT64) {
        isDelegated = true;
      } else {
        const now = await readonlyToken.signer.getBlockTimestamp();
        isDelegated = expiryTimestamp >= now;
      }
      return { isDelegated, expiryTimestamp };
    },
    enabled: config.query?.enabled !== false,
  } as const;
}
