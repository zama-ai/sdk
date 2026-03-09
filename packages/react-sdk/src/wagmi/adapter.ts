import type { GenericSigner } from "@zama-fhe/sdk";
import type { Config } from "wagmi";
import { useConfig } from "wagmi";
import type { WagmiAdapter } from "../config";
import { WagmiSigner } from "./wagmi-signer";

/** Create a lazy wallet adapter descriptor for wagmi-backed signing. */
export function wagmiAdapter(): WagmiAdapter {
  return {
    type: "wagmi",
    useConfig,
    createSigner: (config: unknown): GenericSigner => new WagmiSigner({ config: config as Config }),
  };
}
