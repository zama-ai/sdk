import { Token, type BatchDecryptAsOptions } from "../token/token";
import type { Address } from "viem";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link batchDecryptBalancesAsMutationOptions}. */
export type BatchDecryptBalancesAsParams = BatchDecryptAsOptions;

export function batchDecryptBalancesAsMutationOptions(
  tokens: Token[],
): MutationFactoryOptions<
  readonly ["zama.batchDecryptBalancesAs", ...Address[]],
  BatchDecryptBalancesAsParams,
  Map<Address, bigint>
> {
  return {
    mutationKey: ["zama.batchDecryptBalancesAs", ...tokens.map((t) => t.address)] as const,
    mutationFn: async (params) => Token.batchDecryptBalancesAs(tokens, params),
  };
}
