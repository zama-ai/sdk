import { HardhatConfig, HoodiConfig, MainnetConfig, SepoliaConfig } from "../relayer/relayer-utils";
import { toFheChain } from "./utils";

export const mainnet = toFheChain(MainnetConfig);
export const sepolia = toFheChain(SepoliaConfig);
export const hoodi = toFheChain(HoodiConfig);
export const hardhat = toFheChain(HardhatConfig);
export const anvil = toFheChain(HardhatConfig);

export type { FheChain, AtLeastOneChain } from "./types";
export { toFheChain } from "./utils";
