import type { FheChain } from "../chains";
import { buildZamaConfig } from "../config/build";
import type { ZamaConfig } from "../config/types";
import { EthersProvider } from "./ethers-provider";
import { EthersSigner } from "./ethers-signer";
import type { ZamaConfigEthers } from "./types";
import type { EthersSignerConfig } from "./ethers-signer";
import type { EthersProviderConfig } from "./ethers-provider";

/** Create a {@link ZamaConfig} from ethers types. */
export function createConfig<const TChains extends readonly [FheChain, ...FheChain[]]>(
  params: ZamaConfigEthers<TChains>,
): ZamaConfig {
  const signer = new EthersSigner(params as EthersSignerConfig);
  const provider = new EthersProvider(params as EthersProviderConfig);
  return buildZamaConfig(signer, provider, params);
}
