import { createPublicClient, http } from "viem";
import { ViemProvider } from "@zama-fhe/sdk/viem";
import { defined } from "./encoding.js";
import type { ProviderConfig } from "./config-options.js";

export function createHttpProvider(network: string, options?: ProviderConfig): ViemProvider {
  const { headers, pollingInterval, ...transportOptions } = options ?? {};
  return new ViemProvider({
    publicClient: createPublicClient({
      transport: http(network, {
        ...transportOptions,
        ...defined({ fetchOptions: headers === undefined ? undefined : { headers } }),
      }),
      ...defined({ pollingInterval }),
    }),
  });
}
