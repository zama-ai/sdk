import type { FheChain } from "../chains";
import { buildZamaConfig } from "./build";
import type { ZamaConfig, ZamaConfigGeneric } from "./types";

/**
 * Create a {@link ZamaConfig} from a custom {@link GenericSigner} and
 * {@link GenericProvider}. Use this when the built-in adapter paths
 * (`@zama-fhe/sdk/viem`, `@zama-fhe/sdk/ethers`, `@zama-fhe/react-sdk/wagmi`)
 * don't cover your setup — e.g. a server-side relayer that implements
 * `GenericSigner` directly.
 *
 * @example
 * ```ts
 * import { createConfig, web, memoryStorage } from "@zama-fhe/sdk";
 * import { sepolia } from "@zama-fhe/sdk/chains";
 *
 * const config = createConfig({
 *   chains: [sepolia],
 *   signer: myCustomSigner,
 *   provider: myCustomProvider,
 *   storage: memoryStorage,
 *   relayers: { [sepolia.id]: web() },
 * });
 * const sdk = new ZamaSDK(config);
 * ```
 */
export function createConfig<const TChains extends readonly [FheChain, ...FheChain[]]>(
  params: ZamaConfigGeneric<TChains>,
): ZamaConfig {
  return buildZamaConfig(params.signer, params.provider, params);
}
