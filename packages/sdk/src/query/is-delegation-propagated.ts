import type { Address } from "viem";
import type { ZamaSDK } from "../zama-sdk";
import { assertNonNullable } from "../utils";
import type { EncryptedInput } from "./user-decrypt";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";

export interface IsDelegationPropagatedQueryConfig {
  /** Encrypted values to probe, each paired with its contract address. */
  encryptedInputs: EncryptedInput[];
  /** The address that granted delegation rights to the connected wallet. */
  delegatorAddress?: Address;
  /** The delegate (connected wallet) address — used for the cache key and gating. */
  delegateAddress?: Address;
  query?: Record<string, unknown>;
}

/**
 * Query options for whether a delegation has propagated to the gateway and is
 * usable — wraps `sdk.delegations.isPropagated`. Poll with `refetchInterval`
 * until the result is `true`.
 */
export function isDelegationPropagatedQueryOptions(
  sdk: ZamaSDK,
  config: IsDelegationPropagatedQueryConfig,
): QueryFactoryOptions<
  boolean,
  Error,
  boolean,
  ReturnType<typeof zamaQueryKeys.delegationPropagation.scope>
> {
  return {
    ...filterQueryOptions(config.query ?? {}),
    queryKey: zamaQueryKeys.delegationPropagation.scope(
      config.encryptedInputs,
      config.delegatorAddress,
      config.delegateAddress,
    ),
    queryFn: async (context) => {
      const [, { delegatorAddress, encryptedInputs: keyedInputs }] = context.queryKey;
      assertNonNullable(delegatorAddress, "isDelegationPropagatedQueryOptions: delegatorAddress");
      return sdk.delegations.isPropagated(keyedInputs, delegatorAddress);
    },
    enabled:
      config.encryptedInputs.length > 0 &&
      Boolean(config.delegatorAddress && config.delegateAddress) &&
      config.query?.enabled !== false,
  } as const;
}
