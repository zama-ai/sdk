import { buildZamaConfig } from "../config/build";
import type { ZamaConfig } from "../config/types";
import { EthersSigner } from "./ethers-signer";
import type { ZamaConfigEthers } from "./types";

/** Create a {@link ZamaConfig} from ethers types. */
export function createZamaConfig(params: ZamaConfigEthers): ZamaConfig {
  const signer = new EthersSigner(params);
  return buildZamaConfig(signer, params);
}
