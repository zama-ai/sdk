import type { Address, GenericSigner } from "../token/token.types";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";

export interface SignerAddressQueryConfig {
  query?: Record<string, unknown>;
}

export function signerAddressQueryOptions(
  signer: GenericSigner,
  tokenAddress: Address,
  config?: SignerAddressQueryConfig,
): QueryFactoryOptions<ReturnType<typeof zamaQueryKeys.signerAddress.token>, Address> {
  const queryKey = zamaQueryKeys.signerAddress.token(tokenAddress);

  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey,
    queryFn: async () => signer.getAddress(),
    staleTime: 30_000,
    enabled: config?.query?.enabled !== false,
  };
}
