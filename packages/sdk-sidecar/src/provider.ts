import { createPublicClient, http } from "viem";
import { ViemProvider } from "@zama-fhe/sdk/viem";
import type { ProviderConfig } from "./config-options.js";

export function createHttpProvider(network: string, options?: ProviderConfig): ViemProvider {
  const { headers, pollingInterval, ...transportOptions } = options ?? {};
  return new ViemProvider({
    publicClient: createPublicClient({
      transport: http(
        network,
        options === undefined
          ? undefined
          : {
              ...transportOptions,
              ...(headers === undefined ? {} : { fetchOptions: { headers } }),
            },
      ),
      ...(pollingInterval === undefined ? {} : { pollingInterval }),
    }),
  });
}
