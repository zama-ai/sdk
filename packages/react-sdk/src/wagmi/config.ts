import { buildZamaConfig, type ZamaConfig, type ZamaConfigBase } from "@zama-fhe/sdk";
import type { FheChain } from "@zama-fhe/sdk/chains";
import type { Config } from "wagmi";
import { WagmiSigner } from "./wagmi-signer";

/** At least one chain is required. */
type AtLeastOneChain = readonly [FheChain, ...FheChain[]];

/** Wagmi-backed config — signer derived from wagmi Config. */
export interface ZamaConfigWagmi<
  TChains extends AtLeastOneChain = AtLeastOneChain,
  T = Config,
> extends ZamaConfigBase<TChains> {
  wagmiConfig: T;
}

/** Create a {@link ZamaConfig} from a wagmi `Config`. */
export function createZamaConfig<const TChains extends AtLeastOneChain>(
  params: ZamaConfigWagmi<TChains>,
): ZamaConfig {
  const { wagmiConfig } = params;
  const signer = new WagmiSigner({ config: wagmiConfig });
  return buildZamaConfig(signer, params);
}
