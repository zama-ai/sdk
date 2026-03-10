import type { ReadonlyToken } from "../token/readonly-token";
import type { Address } from "viem";
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

const PERMANENT = 2n ** 64n - 1n;

function deriveDelegationFromExpiry(expiryTimestamp: bigint) {
  if (expiryTimestamp === 0n) {
    return false;
  }
  if (expiryTimestamp === PERMANENT) {
    return true;
  }
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  return expiryTimestamp >= nowSeconds;
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
    queryFn: async () => {
      const expiryTimestamp = await readonlyToken.getDelegationExpiry({
        delegatorAddress: config.delegatorAddress,
        delegateAddress: config.delegateAddress,
      });
      // Derive isDelegated locally to avoid a redundant RPC call
      // (isDelegated() internally calls getDelegationExpiry() again)
      const isDelegated = deriveDelegationFromExpiry(expiryTimestamp);
      return { isDelegated, expiryTimestamp };
    },
    enabled: config.query?.enabled !== false,
  } as const;
}
