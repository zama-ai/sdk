import { sepolia, mainnet, hardhat, hoodi } from "viem/chains";

export type FhevmChainId =
  | typeof mainnet.id
  | typeof sepolia.id
  | typeof hardhat.id
  | typeof hoodi.id;

export interface FhevmChain<TChainId extends FhevmChainId = FhevmChainId> {
  id: TChainId;
  name: string;
}

export const fhevmMainnet = {
  id: mainnet.id,
  name: mainnet.name,
} as const satisfies FhevmChain;

export const fhevmSepolia = {
  id: sepolia.id,
  name: sepolia.name,
} as const satisfies FhevmChain;

export const fhevmHardhat = {
  id: hardhat.id,
  name: hardhat.name,
} as const satisfies FhevmChain;

export const fhevmHoodi = {
  id: hoodi.id,
  name: hoodi.name,
} as const satisfies FhevmChain;

export const fhevmChains = [
  fhevmMainnet,
  fhevmSepolia,
  fhevmHardhat,
  fhevmHoodi,
] as const satisfies readonly FhevmChain[];
