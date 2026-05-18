import type { Address } from "viem";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** TanStack Query mutation factory for {@link Permits.revokePermits}. */
export function revokePermitsMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.revokePermits"], Address[] | void, void> {
  return {
    mutationKey: ["zama.revokePermits"],
    mutationFn: (contracts: Address[] | void) =>
      contracts === undefined ? sdk.permits.revokePermits() : sdk.permits.revokePermits(contracts),
  };
}
