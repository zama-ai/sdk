import { confidentialBalanceOfContract } from "../contracts";
import type { Handle } from "../relayer/relayer-sdk.types";
import type { GenericSigner } from "../types";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";
import type { Address } from "viem";

const DEFAULT_POLLING_INTERVAL = 10_000;

export interface ConfidentialHandlesQueryConfig {
  owner?: Address;
  pollingInterval?: number;
  query?: Record<string, unknown>;
}

export function confidentialHandlesQueryOptions(
  signer: GenericSigner,
  tokenAddresses: Address[],
  config?: ConfidentialHandlesQueryConfig,
): QueryFactoryOptions<
  Handle[],
  Error,
  Handle[],
  ReturnType<typeof zamaQueryKeys.confidentialHandles.tokens>
> {
  const ownerKey = config?.owner;
  const queryEnabled = config?.query?.enabled !== false;
  const queryKey = zamaQueryKeys.confidentialHandles.tokens(tokenAddresses, ownerKey);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddresses: keyTokenAddresses, owner: keyOwner }] = context.queryKey;
      if (!keyOwner) {
        throw new Error("owner is required");
      }
      return Promise.all(
        keyTokenAddresses.map(async (tokenAddress) => {
          const handle = await signer.readContract(
            confidentialBalanceOfContract(tokenAddress, keyOwner),
          );
          return handle;
        }),
      );
    },
    enabled: Boolean(ownerKey && tokenAddresses.length > 0) && queryEnabled,
    refetchInterval: config?.pollingInterval ?? DEFAULT_POLLING_INTERVAL,
  };
}
