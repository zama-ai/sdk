import type { FheChain } from "../chains";
import type { ZamaConfig } from "../config/types";
import { buildZamaConfig } from "../config/build";
import { ViemProvider } from "./viem-provider";
import { ViemSigner } from "./viem-signer";
import type { ZamaConfigViem } from "./types";

/** Create a {@link ZamaConfig} from viem clients. */
export function createConfig<const TChains extends readonly [FheChain, ...FheChain[]]>(
  params: ZamaConfigViem<TChains>,
): ZamaConfig {
  const signer = new ViemSigner({
    walletClient: params.walletClient,
    ethereum: params.ethereum,
  });
  const provider = new ViemProvider({ publicClient: params.publicClient });
  return buildZamaConfig(signer, provider, params);
}
