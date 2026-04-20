import {
  SepoliaConfig,
  MainnetConfig,
  HardhatConfig,
  HoodiConfig,
  type ExtendedFhevmInstanceConfig,
} from "../relayer/relayer-utils";

export interface FheChain extends Omit<ExtendedFhevmInstanceConfig, "chainId"> {
  readonly id: number;
}

function toFheChain<T extends ExtendedFhevmInstanceConfig>({ chainId, ...config }: T): FheChain {
  return { ...config, id: chainId };
}

export const mainnet = toFheChain(MainnetConfig);
export const sepolia = toFheChain(SepoliaConfig);
export const hoodi = toFheChain(HoodiConfig);
export const hardhat = toFheChain(HardhatConfig);
export const anvil = toFheChain(HardhatConfig);
