import type { Address } from "viem";
import type { DelegationStatus } from "../services/delegation-service";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";
import { assertNonNullable } from "../utils";

export type { DelegationStatus } from "../services/delegation-service";

/** Configuration for {@link delegationStatusQueryOptions}. */
export interface DelegationStatusQueryConfig {
  /** Contract the delegation applies to; pass `undefined` to keep the query disabled. */
  contractAddress: Address | undefined;
  /** Address granting the delegated decryption rights; the query stays disabled until provided. */
  delegatorAddress?: Address;
  /** Address receiving the delegated decryption rights; the query stays disabled until provided. */
  delegateAddress?: Address;
  /** Additional TanStack Query options merged into the generated query (e.g. `staleTime`, `enabled`). */
  query?: Record<string, unknown>;
}

/** Builds TanStack Query options for reading the decryption-delegation status between a delegator and a delegate on a contract. */
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
