import { confidentialBalanceOfContract } from "../contracts";
import type { Address, GenericSigner } from "../token/token.types";
import type { Hex } from "viem";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions, normalizeHandle } from "./utils";

const DEFAULT_POLLING_INTERVAL = 10_000;

export interface ConfidentialHandleQueryConfig {
  owner?: Address;
  pollingInterval?: number;
  query?: Record<string, unknown>;
}

export function confidentialHandleQueryOptions(
  signer: GenericSigner,
  tokenAddress: Address,
  config?: ConfidentialHandleQueryConfig,
): QueryFactoryOptions<Hex, Error, Hex, ReturnType<typeof zamaQueryKeys.confidentialHandle.owner>> {
  const ownerKey = config?.owner ?? "";
  const queryKey = zamaQueryKeys.confidentialHandle.owner(tokenAddress, ownerKey);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress, owner: keyOwner }] = context.queryKey;
      const handle = await signer.readContract(
        confidentialBalanceOfContract(keyTokenAddress as Address, keyOwner as Address),
      );
      return normalizeHandle(handle);
    },
    enabled: Boolean(ownerKey) && config?.query?.enabled !== false,
    refetchInterval: config?.pollingInterval ?? DEFAULT_POLLING_INTERVAL,
  };
}
