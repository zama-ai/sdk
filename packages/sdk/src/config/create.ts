import type { AtLeastOneChain } from "../chains";
import { buildZamaConfig } from "./build";
import type { ExactRelayers, RelayersFor, ZamaConfig, ZamaConfigGeneric } from "./types";

/**
 * Create a {@link ZamaConfig} from a custom {@link GenericSigner} and
 * {@link GenericProvider}. Use this when the built-in adapter paths
 * (`@zama-fhe/sdk/viem`, `@zama-fhe/sdk/ethers`, `@zama-fhe/react-sdk/wagmi`)
 * don't cover your setup — e.g. a server-side relayer that implements
 * `GenericSigner` directly.
 *
 * @example
 * ```ts
 * import { createConfig, memoryStorage } from "@zama-fhe/sdk";
 * import { web } from "@zama-fhe/sdk/web";
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
export function createConfig<
  const TChains extends AtLeastOneChain,
  const TRelayers extends RelayersFor<TChains> = RelayersFor<TChains>,
>(
  params: ZamaConfigGeneric<TChains> & { relayers: ExactRelayers<TChains, TRelayers> },
): ZamaConfig {
  return buildZamaConfig(params.signer, params.provider, params);
}
