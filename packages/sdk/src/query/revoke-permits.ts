import type { Address } from "viem";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** TanStack Query mutation factory for {@link ZamaSDK.revokePermits}. */
export function revokePermitsMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.revokePermits"], Address[] | undefined, void> {
  return {
    mutationKey: ["zama.revokePermits"],
    mutationFn: (contracts) =>
      contracts === undefined ? sdk.revokePermits() : sdk.revokePermits(contracts),
  };
}
