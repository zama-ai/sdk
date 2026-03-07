import { confidentialBalanceOfContract } from "../contracts";
import type { Handle } from "../relayer/relayer-sdk.types";
import type { Address, GenericSigner } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";

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
  const ownerKey = config?.owner ?? "";
  const queryKey = zamaQueryKeys.confidentialHandles.tokens(tokenAddresses, ownerKey);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { tokenAddresses: keyTokenAddresses, owner: keyOwner }] = context.queryKey;
      return Promise.all(
        keyTokenAddresses.map(async (tokenAddress) => {
          const handle = await signer.readContract(
            confidentialBalanceOfContract(tokenAddress, keyOwner as Address),
          );
          return handle as Handle;
        }),
      );
    },
    enabled: Boolean(ownerKey) && tokenAddresses.length > 0 && config?.query?.enabled !== false,
    refetchInterval: config?.pollingInterval ?? DEFAULT_POLLING_INTERVAL,
  };
}
