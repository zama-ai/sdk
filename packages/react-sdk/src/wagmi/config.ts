import {
  buildRelayer,
  resolveChainTransports,
  resolveStorage,
  type GenericSigner,
  type ZamaConfig,
  type ZamaConfigBase,
} from "@zama-fhe/sdk";
import type { Config } from "wagmi";
import { getChainId } from "wagmi/actions";
import { WagmiSigner } from "./wagmi-signer";

/** Wagmi-backed config — signer derived from wagmi Config. */
export interface ZamaConfigWagmi<T = Config> extends ZamaConfigBase {
  wagmiConfig: T;
  relayer?: never;
  signer?: never;
  viem?: never;
  ethers?: never;
}

/** Create a {@link ZamaConfig} from a wagmi `Config`. */
export function createZamaConfig(params: ZamaConfigWagmi): ZamaConfig {
  const { wagmiConfig } = params;
  const signer: GenericSigner = new WagmiSigner({ config: wagmiConfig });
  const getChainIdFn = () => Promise.resolve(getChainId(wagmiConfig));

  const chainIds = wagmiConfig.chains.map((c) => c.id);
  const { storage, sessionStorage } = resolveStorage(params.storage, params.sessionStorage);
  const chainTransports = resolveChainTransports(params.chains, params.transports, chainIds);
  const relayer = buildRelayer(chainTransports, getChainIdFn);

  return {
    chains: params.chains,
    relayer,
    signer,
    storage,
    sessionStorage,
    keypairTTL: params.keypairTTL,
    sessionTTL: params.sessionTTL,
    registryTTL: params.registryTTL,
    onEvent: params.onEvent,
  };
}
