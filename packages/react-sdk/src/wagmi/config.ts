import { buildZamaConfig, type ZamaConfig, type ZamaConfigBase } from "@zama-fhe/sdk";
import type { AtLeastOneChain } from "@zama-fhe/sdk/chains";
import type { Config } from "wagmi";
import { WagmiProvider } from "./wagmi-provider";
import { WagmiSigner } from "./wagmi-signer";

/** Wagmi-backed config — signer derived from wagmi Config. */
export interface ZamaConfigWagmi<
  TChains extends AtLeastOneChain = AtLeastOneChain,
  T = Config,
> extends ZamaConfigBase<TChains> {
  wagmiConfig: T;
}

/** Create a {@link ZamaConfig} from a wagmi `Config`. */
export function createConfig<const TChains extends AtLeastOneChain>(
  params: ZamaConfigWagmi<TChains>,
): ZamaConfig {
  const { wagmiConfig } = params;
  const signer = new WagmiSigner({ config: wagmiConfig });
  const provider = new WagmiProvider({ config: wagmiConfig });
  return buildZamaConfig(signer, provider, params);
}
