/**
 * Wagmi integration for the Zama React SDK.
 *
 * Use {@link ZamaWagmiProvider} as the entry point for wagmi-based React apps.
 * It reads wagmi's connection state internally and passes the appropriate
 * provider/signer to the generic {@link ZamaProvider}.
 *
 * The low-level wagmi provider and signer adapters are intentionally not
 * exported from this public entry point. They depend on wagmi connection
 * semantics where a config can exist before a usable signer identity exists;
 * centralizing construction in {@link ZamaWagmiProvider} keeps disconnected
 * and reconnecting states from being exposed as valid signing capabilities.
 *
 * @packageDocumentation
 */

export { ZamaWagmiProvider, type ZamaWagmiProviderProps } from "./zama-wagmi-provider";
