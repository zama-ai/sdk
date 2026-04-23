import { HardhatConfig, HoodiConfig, MainnetConfig, SepoliaConfig } from "../relayer/relayer-utils";
import { toFheChain } from "./utils";

export const mainnet = toFheChain(MainnetConfig);
export const sepolia = toFheChain(SepoliaConfig);
export const hoodi = toFheChain(HoodiConfig);
export const hardhat = toFheChain(HardhatConfig);
/**
 * Alias for {@link hardhat}
 */
export const anvil = hardhat;

export type { FheChain, AtLeastOneChain } from "./types";
export { toFheChain } from "./utils";
