import { createPublicClient, http } from "viem";
import { networkConfig } from "../config/network.js";

/**
 * Shared viem public client for read-only RPC calls.
 * Used by tests and by the internal GenericSigner adapter in zamaFlow.test.ts.
 */
export const publicClient = createPublicClient({
  chain: networkConfig.chain,
  transport: http(networkConfig.rpcUrl),
});
