import { confidentialBalanceOfContract } from "../contracts";
import type { Handle } from "../relayer/relayer-sdk.types";
import type { GenericSigner } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { zamaQueryKeys } from "./query-keys";
import { filterQueryOptions } from "./utils";
import type { Address } from "viem";

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
): QueryFactoryOptions<
  Handle,
  Error,
  Handle,
  ReturnType<typeof zamaQueryKeys.confidentialHandle.owner>
> {
  const ownerKey = config?.owner;
  const queryEnabled = config?.query?.enabled !== false;
  const queryKey = zamaQueryKeys.confidentialHandle.owner(tokenAddress, ownerKey);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context: { queryKey: typeof queryKey }) => {
      const [, { tokenAddress: keyTokenAddress, owner: keyOwner }] = context.queryKey;
      if (!keyOwner) throw new Error("owner is required");
      const handle = await signer.readContract(
        confidentialBalanceOfContract(keyTokenAddress, keyOwner),
      );
      return handle;
    },
    enabled: Boolean(ownerKey) && queryEnabled,
    refetchInterval: config?.pollingInterval ?? DEFAULT_POLLING_INTERVAL,
  };
}
