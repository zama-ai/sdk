import type { Address } from "viem";
import { MAX_UINT64 } from "../contracts";
import { getDelegationExpiryContract } from "../contracts/acl";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { GenericSigner } from "../types";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";

export interface DelegationStatusData {
  isDelegated: boolean;
  expiryTimestamp: bigint;
}

export interface DelegationStatusQueryConfig {
  delegatorAddress?: Address;
  delegateAddress?: Address;
  query?: Record<string, unknown>;
}

export function delegationStatusQueryOptions(
  signer: GenericSigner,
  relayer: RelayerSDK,
  tokenAddress: Address | undefined,
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
      tokenAddress,
      config.delegatorAddress,
      config.delegateAddress,
    ),
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress, delegatorAddress, delegateAddress }] =
        context.queryKey;
      if (!keyTokenAddress) {
        throw new Error("tokenAddress is required");
      }
      if (!delegatorAddress) {
        throw new Error("delegatorAddress is required");
      }
      if (!delegateAddress) {
        throw new Error("delegateAddress is required");
      }
      const acl = await relayer.getAclAddress();
      const expiryTimestamp = await signer.readContract(
        getDelegationExpiryContract(acl, delegatorAddress, delegateAddress, keyTokenAddress),
      );
      // Derive isDelegated from expiry + chain time to stay consistent
      // with ReadonlyToken.isDelegated() (avoids client-clock skew).
      let isDelegated: boolean;
      if (expiryTimestamp === 0n) {
        isDelegated = false;
      } else if (expiryTimestamp === MAX_UINT64) {
        isDelegated = true;
      } else {
        const now = await signer.getBlockTimestamp();
        isDelegated = expiryTimestamp > now;
      }
      return { isDelegated, expiryTimestamp };
    },
    enabled:
      Boolean(tokenAddress && config.delegatorAddress && config.delegateAddress) &&
      config.query?.enabled !== false,
  } as const;
}
