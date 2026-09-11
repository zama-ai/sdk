import type { FheChain } from "../chains";
import { buildZamaConfig } from "../config/build";
import type { ZamaConfig } from "../config/types";
import { EthersProvider } from "./ethers-provider";
import { EthersSigner } from "./ethers-signer";
import type { ZamaConfigEthers } from "./types";

/** Create a {@link ZamaConfig} from ethers types. */
export function createConfig<const TChains extends readonly [FheChain, ...FheChain[]]>(
  params: ZamaConfigEthers<TChains>,
): ZamaConfig {
  if ("signer" in params && params.signer) {
    const signer = new EthersSigner({ signer: params.signer });
    if (!params.signer.provider) {
      throw new Error("createConfig requires a Signer with an attached provider for chain reads");
    }
    const provider = new EthersProvider({ provider: params.signer.provider });
    return buildZamaConfig(signer, provider, params);
  }

  const signer = new EthersSigner({ ethereum: params.ethereum });
  const provider =
    "provider" in params && params.provider
      ? new EthersProvider({ provider: params.provider })
      : new EthersProvider({ ethereum: params.ethereum });
  return buildZamaConfig(signer, provider, params);
}
