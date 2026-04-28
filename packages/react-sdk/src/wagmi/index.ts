/**
 * Wagmi integration for the Zama React SDK.
 *
 * Use {@link ZamaWagmiProvider} as the single entry point for wagmi-based
 * React apps. Low-level wagmi provider and signer adapters are intentionally
 * not exported from this package entry point, keeping disconnected and
 * reconnecting states from being exposed as valid signing capabilities.
 *
 * @packageDocumentation
 */

export { ZamaWagmiProvider, type ZamaWagmiProviderProps } from "./zama-wagmi-provider";
