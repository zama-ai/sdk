import type { Address } from "viem";
import { MAX_UINT64 } from "../contracts";
import { getDelegationExpiryContract } from "../contracts/acl";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";
import { assertNonNullable } from "../utils";

export interface DelegationStatusData {
  isDelegated: boolean;
  expiryTimestamp: bigint;
}

export interface DelegationStatusQueryConfig {
  tokenAddress: Address | undefined;
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
      config.tokenAddress,
      config.delegatorAddress,
      config.delegateAddress,
    ),
    queryFn: async (context) => {
      const [, { tokenAddress, delegatorAddress, delegateAddress }] = context.queryKey;
      assertNonNullable(tokenAddress, "delegationStatusQueryOptions: tokenAddress");
      assertNonNullable(delegatorAddress, "delegationStatusQueryOptions: delegatorAddress");
      assertNonNullable(delegateAddress, "delegationStatusQueryOptions: delegateAddress");
      const acl = await sdk.relayer.getAclAddress();
      const expiryTimestamp = await sdk.provider.readContract(
        getDelegationExpiryContract(acl, delegatorAddress, delegateAddress, tokenAddress),
      );
      // Derive isDelegated from expiry + chain time to stay consistent
      // with ReadonlyToken.isDelegated() (avoids client-clock skew).
      let isDelegated: boolean;
      if (expiryTimestamp === 0n) {
        isDelegated = false;
      } else if (expiryTimestamp === MAX_UINT64) {
        isDelegated = true;
      } else {
        const now = await sdk.provider.getBlockTimestamp();
        isDelegated = expiryTimestamp > now;
      }
      return { isDelegated, expiryTimestamp };
    },
    enabled:
      Boolean(config.tokenAddress && config.delegatorAddress && config.delegateAddress) &&
      config.query?.enabled !== false,
  } as const;
}
