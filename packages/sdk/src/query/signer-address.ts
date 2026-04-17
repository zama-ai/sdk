import type { GenericSigner } from "../types";
import type { ZamaSDK } from "../zama-sdk";
import type { QueryFactoryOptions } from "./factory-types";
import { filterQueryOptions } from "./utils";
import { zamaQueryKeys } from "./query-keys";
import type { Address } from "viem";

// Scope the query key by the signer identity (which is stable across SDK
// recreations — the SDK itself may be re-instantiated on every provider
// render). We use a readonly signer marker (`NO_SIGNER`) so a read-only SDK
// shares a single query bucket that will throw in `queryFn`.
const NO_SIGNER: GenericSigner = Object.freeze({
  getChainId: () => Promise.reject(new Error("no signer")),
  getAddress: () => Promise.reject(new Error("no signer")),
  signTypedData: () => Promise.reject(new Error("no signer")),
  writeContract: () => Promise.reject(new Error("no signer")),
}) as GenericSigner;

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
  sdk: ZamaSDK,
  config?: SignerAddressQueryConfig,
): QueryFactoryOptions<
  Address,
  Error,
  Address,
  ReturnType<typeof zamaQueryKeys.signerAddress.scope>
> {
  const signer = sdk.signer ?? NO_SIGNER;
  return {
    ...filterQueryOptions(config?.query ?? {}),
    queryKey: zamaQueryKeys.signerAddress.scope(getSignerScope(signer)),
    queryFn: async () => sdk.requireSigner("signerAddress").getAddress(),
    staleTime: 30_000,
    enabled: config?.query?.enabled !== false,
  };
}
