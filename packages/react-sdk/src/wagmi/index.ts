/**
 * Wagmi integration for the Zama React SDK.
 *
 * Use {@link ZamaWagmiProvider} as the entry point for wagmi-based React apps.
 * It reads wagmi's connection state internally and passes the appropriate
 * provider/signer to the generic {@link ZamaProvider}.
 *
 * @packageDocumentation
 */

export { WagmiSigner, type WagmiSignerConfig } from "./wagmi-signer";
export { createConfig, type ZamaConfigWagmi } from "./config";
export { WagmiProvider, type WagmiProviderConfig } from "./wagmi-provider";
export { ZamaWagmiProvider, type ZamaWagmiProviderProps } from "./zama-wagmi-provider";
