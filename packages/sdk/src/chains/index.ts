import {
  SepoliaConfig,
  MainnetConfig,
  HardhatConfig,
  HoodiConfig,
  type ExtendedFhevmInstanceConfig,
} from "../relayer/relayer-utils";

export type FheChain = ExtendedFhevmInstanceConfig & { readonly id: number };

function withId<T extends ExtendedFhevmInstanceConfig>(config: T): T & { readonly id: number } {
  return { ...config, id: config.chainId };
}

export const sepolia = withId(SepoliaConfig);
export const mainnet = withId(MainnetConfig);
export const hardhat = withId(HardhatConfig);
export const hoodi = withId(HoodiConfig);
