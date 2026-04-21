import type { ZamaConfig } from "../config/types";
import { buildZamaConfig } from "../config/build";
import { ViemSigner } from "./viem-signer";
import type { ZamaConfigViem } from "./types";

/** Create a {@link ZamaConfig} from viem clients. */
export function createZamaConfig(params: ZamaConfigViem): ZamaConfig {
  const signer = new ViemSigner({
    publicClient: params.publicClient,
    walletClient: params.walletClient,
    ethereum: params.ethereum,
  });
  return buildZamaConfig(signer, params);
}
