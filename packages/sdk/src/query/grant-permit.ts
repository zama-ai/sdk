import type { Address } from "viem";
import type { WildcardPermit } from "../credentials/utils";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

/**
 * Builds TanStack Query mutation options for {@link Permits.grantPermit | granting}
 * decryption permits for the given contract addresses, or {@link WILDCARD_PERMIT}
 * for a permissive V2 permit covering every contract.
 */
export function grantPermitMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.grantPermit"], Address[] | WildcardPermit, void> {
  return {
    mutationKey: ["zama.grantPermit"],
    mutationFn: (contractAddresses) => sdk.permits.grantPermit(contractAddresses),
  };
}
