import type { Address } from "../utils/address";
import type { GenericSigner } from "../types";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";

const signerScopes = new WeakMap<GenericSigner, number>();
let nextSignerScope = 1;

function getSignerScope(signer: GenericSigner): number {
  const existingScope = signerScopes.get(signer);
  if (existingScope !== undefined) {
    return existingScope;
  }
  const newScope = nextSignerScope++;
  signerScopes.set(signer, newScope);
  return newScope;
}

export interface SignerAddressQueryConfig {
  query?: Record<string, unknown>;
}

export function signerAddressQueryOptions(
  signer: GenericSigner,
  config?: SignerAddressQueryConfig,
): QueryFactoryOptions<
  Address,
  Error,
  Address,
  ReturnType<typeof zamaQueryKeys.signerAddress.scope>
> {
  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey: zamaQueryKeys.signerAddress.scope(getSignerScope(signer)),
    queryFn: async () => signer.getAddress(),
    staleTime: 30_000,
    enabled: config?.query?.enabled !== false,
  };
}
