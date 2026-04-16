import { confidentialBalanceOfContract } from "../contracts";
import type { Handle } from "../relayer/relayer-sdk.types";
import type { GenericSigner } from "../types";
import { assertNonNullable } from "../utils/assertions";
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
  ReturnType<typeof zamaQueryKeys.confidentialBalance.owner>
> {
  const ownerKey = config?.owner;
  const queryEnabled = config?.query?.enabled !== false;
  const queryKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, ownerKey);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddress: keyTokenAddress, owner: keyOwner }] = context.queryKey;
      assertNonNullable(keyOwner, "confidentialHandleQueryOptions: owner");
      const handle = await signer.readContract(
        confidentialBalanceOfContract(keyTokenAddress, keyOwner),
      );
      return handle;
    },
    enabled: Boolean(ownerKey) && queryEnabled,
    refetchInterval: config?.pollingInterval ?? DEFAULT_POLLING_INTERVAL,
  };
}
