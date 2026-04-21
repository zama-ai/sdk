import type { FheChain } from "../chains";
import { buildZamaConfig } from "../config/build";
import type { ZamaConfig } from "../config/types";
import { EthersSigner } from "./ethers-signer";
import type { ZamaConfigEthers } from "./types";

/** Create a {@link ZamaConfig} from ethers types. */
export function createZamaConfig<const TChains extends readonly [FheChain, ...FheChain[]]>(
  params: ZamaConfigEthers<TChains>,
): ZamaConfig {
  const signer = new EthersSigner(params);
  return buildZamaConfig(signer, params);
}
