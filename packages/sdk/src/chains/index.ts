export type FhevmChainId = 1 | 11155111 | 31337 | 560048;

export interface FhevmChain<TChainId extends FhevmChainId = FhevmChainId> {
  id: TChainId;
  name: string;
}

export const fhevmMainnet = {
  id: 1,
  name: "Ethereum Mainnet",
} as const satisfies FhevmChain<1>;

export const fhevmSepolia = {
  id: 11155111,
  name: "Sepolia",
} as const satisfies FhevmChain<11155111>;

export const fhevmHardhat = {
  id: 31337,
  name: "Hardhat",
} as const satisfies FhevmChain<31337>;

export const fhevmHoodi = {
  id: 560048,
  name: "Hoodi",
} as const satisfies FhevmChain<560048>;

export const fhevmChains = [
  fhevmMainnet,
  fhevmSepolia,
  fhevmHardhat,
  fhevmHoodi,
] as const satisfies readonly FhevmChain[];
