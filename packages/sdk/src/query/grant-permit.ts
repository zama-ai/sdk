import type { Address } from "viem";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/** Builds TanStack Query mutation options for {@link Permits.grantPermit | granting} decryption permits for the given contract addresses. */
export function grantPermitMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.grantPermit"], Address[], void> {
  return {
    mutationKey: ["zama.grantPermit"],
    mutationFn: (contractAddresses) => sdk.permits.grantPermit(contractAddresses),
  };
}
