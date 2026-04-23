import type { Address } from "viem";
import type { GenericSigner } from "../types";
import type { QueryFactoryOptions } from "./factory-types";
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

export function signerAddressQueryOptions(
  signer: GenericSigner,
): QueryFactoryOptions<
  Address,
  Error,
  Address,
  ReturnType<typeof zamaQueryKeys.signerAddress.scope>
> {
  return {
    queryKey: zamaQueryKeys.signerAddress.scope(getSignerScope(signer)),
    queryFn: async () => signer.getAddress(),
    staleTime: 30_000,
  };
}
