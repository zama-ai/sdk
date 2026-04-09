import type { Address } from "viem";
import type { ZamaSDK } from "../zama-sdk";
import type { MutationFactoryOptions } from "./factory-types";

export function allowMutationOptions(
  sdk: ZamaSDK,
): MutationFactoryOptions<readonly ["zama.allow"], Address[], void> {
  return {
    mutationKey: ["zama.allow"],
    mutationFn: async (contractAddresses) => {
      const credSet = await sdk.credentials.allow(...contractAddresses);
      if (credSet.failures.size > 0) {
        // Surface the first signing failure so React Query error handlers treat
        // a rejected wallet prompt as a mutation failure rather than silent success.
        const [firstError] = credSet.failures.values();
        throw firstError;
      }
    },
  };
}
