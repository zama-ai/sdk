import type { Address } from "viem";
import { MAX_UINT64 } from "../contracts";
import { getDelegationExpiryContract } from "../contracts/acl";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";
import { assertNonNullable } from "../utils";

export interface DelegationStatusData {
  isActive: boolean;
  expiryTimestamp: bigint;
}

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
  DelegationStatusData,
  Error,
  DelegationStatusData,
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
      const acl = await sdk.relayer.getAclAddress();
      const expiryTimestamp = await sdk.provider.readContract(
        getDelegationExpiryContract(acl, delegatorAddress, delegateAddress, contractAddress),
      );
      // Derive isActive from expiry + chain time to stay consistent
      // with sdk.delegations.isActive() (avoids client-clock skew).
      let isActive: boolean;
      if (expiryTimestamp === 0n) {
        isActive = false;
      } else if (expiryTimestamp === MAX_UINT64) {
        isActive = true;
      } else {
        const now = await sdk.provider.getBlockTimestamp();
        isActive = expiryTimestamp > now;
      }
      return { isActive, expiryTimestamp };
    },
    enabled:
      Boolean(config.contractAddress && config.delegatorAddress && config.delegateAddress) &&
      config.query?.enabled !== false,
  } as const;
}
