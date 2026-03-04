import { ReadonlyToken } from "../token/readonly-token";
import type { Address } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";

export interface ConfidentialBalancesQueryConfig {
  owner?: Address;
  handles?: Address[];
  maxConcurrency?: number;
  query?: Record<string, unknown>;
}

export function confidentialBalancesQueryOptions(
  tokens: ReadonlyToken[],
  config?: ConfidentialBalancesQueryConfig,
): QueryFactoryOptions<
  ReturnType<typeof zamaQueryKeys.confidentialBalances.tokens>,
  Map<Address, bigint>
> {
  const tokenAddresses = tokens.map((token) => token.address);
  const ownerKey = config?.owner ?? "";
  const handlesReady =
    Array.isArray(config?.handles) &&
    config.handles.length === tokens.length &&
    config.handles.every((handle) => Boolean(handle));
  const queryKey = zamaQueryKeys.confidentialBalances.tokens(
    tokenAddresses,
    ownerKey,
    config?.handles,
  );

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async (context) => {
      const [, { owner: keyOwner, handles: keyHandles }] = context.queryKey;
      const balances = await ReadonlyToken.batchDecryptBalances(tokens, {
        owner: keyOwner as Address,
        handles: keyHandles as Address[] | undefined,
        maxConcurrency: config?.maxConcurrency,
      });
      return balances;
    },
    enabled:
      Boolean(ownerKey) &&
      tokens.length > 0 &&
      handlesReady &&
      config?.query?.enabled !== false,
    staleTime: Infinity,
  };
}
