import type { Address } from "viem";
import type { DelegationStatus } from "../services/delegation-service";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";
import { assertNonNullable } from "../utils";

export type { DelegationStatus as DelegationStatusData } from "../services/delegation-service";

export interface DelegationStatusQueryConfig {
  contractAddress: Address | undefined;
  delegatorAddress?: Address;
  delegateAddress?: Address;
  query?: Record<string, unknown>;
}

export function delegationStatusQueryOptions(
  sdk: ZamaSDK,
  config: DelegationStatusQueryConfig,
): QueryFactoryOptions<
  DelegationStatus,
  Error,
  DelegationStatus,
  ReturnType<typeof zamaQueryKeys.delegationStatus.scope>
> {
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey: zamaQueryKeys.delegationStatus.scope(
      config.contractAddress,
      config.delegatorAddress,
      config.delegateAddress,
    ),
    queryFn: async (context) => {
      const [, { contractAddress, delegatorAddress, delegateAddress }] = context.queryKey;
      assertNonNullable(contractAddress, "delegationStatusQueryOptions: contractAddress");
      assertNonNullable(delegatorAddress, "delegationStatusQueryOptions: delegatorAddress");
      assertNonNullable(delegateAddress, "delegationStatusQueryOptions: delegateAddress");
      return sdk.delegations.getStatus({ contractAddress, delegatorAddress, delegateAddress });
    },
    enabled:
      Boolean(config.contractAddress && config.delegatorAddress && config.delegateAddress) &&
      config.query?.enabled !== false,
  } as const;
}
