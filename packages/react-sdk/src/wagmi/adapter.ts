import type { WagmiAdapter } from "../config";

/** Create a lazy wallet adapter descriptor for wagmi-backed signing. */
export function wagmiAdapter(): WagmiAdapter {
  return { type: "wagmi" };
}
