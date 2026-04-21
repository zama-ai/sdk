import { buildZamaConfig, type ZamaConfig, type ZamaConfigBase } from "@zama-fhe/sdk";
import type { Config } from "wagmi";
import { WagmiSigner } from "./wagmi-signer";

/** Wagmi-backed config — signer derived from wagmi Config. */
export interface ZamaConfigWagmi<T = Config> extends ZamaConfigBase {
  wagmiConfig: T;
}

/** Create a {@link ZamaConfig} from a wagmi `Config`. */
export function createZamaConfig(params: ZamaConfigWagmi): ZamaConfig {
  const { wagmiConfig } = params;
  const signer = new WagmiSigner({ config: wagmiConfig });
  return buildZamaConfig(signer, params);
}
