export interface FhevmChain {
  id: number;
  name: string;
}

export const fhevmMainnet: FhevmChain = {
  id: 1,
  name: "Ethereum Mainnet",
};

export const fhevmSepolia: FhevmChain = {
  id: 11155111,
  name: "Sepolia",
};

export const fhevmHardhat: FhevmChain = {
  id: 31337,
  name: "Hardhat",
};
