import type { ZamaSDK } from "../token/zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";
import type { Address } from "viem";

export function revokeMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.revoke"], Address[], void> {
  return {
    mutationKey: ["zama.revoke"],
    mutationFn: (tokenAddresses) => sdk.revoke(...tokenAddresses),
  };
}
