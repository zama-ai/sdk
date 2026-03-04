import { ReadonlyToken } from "../token/readonly-token";
import type { Address } from "../token/token.types";
import type { ZamaSDK } from "../token/zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Variables for {@link authorizeAllMutationOptions}. */
export interface AuthorizeAllParams {
  tokenAddresses: Address[];
}

export function authorizeAllMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["authorizeAll"], AuthorizeAllParams, void> {
  return {
    mutationKey: ["authorizeAll"],
    mutationFn: async ({ tokenAddresses }) => {
      const tokens = tokenAddresses.map((tokenAddress) => sdk.createReadonlyToken(tokenAddress));
      await ReadonlyToken.authorizeAll(tokens);
    },
  };
}
