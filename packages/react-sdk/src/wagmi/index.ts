/**
 * Wagmi integration for the Zama React SDK.
 *
 * Use {@link createConfig} to build a {@link ZamaConfig} from a wagmi
 * `Config`, then pass it to `<ZamaProvider>`. The signer handles
 * connect/disconnect lifecycle via `subscribe()` — no special provider needed.
 *
 * @packageDocumentation
 */

export { createConfig, type ZamaConfigWagmi } from "./config";

/** @deprecated Use `createConfig` + `<ZamaProvider>` instead. Will be removed in the next major. */
export { ZamaWagmiProvider, type ZamaWagmiProviderProps } from "./zama-wagmi-provider";
