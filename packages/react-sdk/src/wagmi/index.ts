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
