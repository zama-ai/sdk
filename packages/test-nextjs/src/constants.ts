import type { Address } from "@zama-fhe/react-sdk";

export const CONTRACTS = {
  USDT: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6" as Address, // USDT (ERC-20)
  cUSDT: "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762" as Address, // cUSDT
  USDC: "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853" as Address, // USDC
  cUSDC: "0x3B02fF1e626Ed7a8fd6eC5299e2C54e1421B626B" as Address, // cUSDC
  feeManager: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
  transferBatcher: "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82" as Address,
} as const;

export const CONFIDENTIAL_TOKEN_ADDRESSES: Address[] = [
  CONTRACTS.cUSDT, // cUSDT
  CONTRACTS.cUSDC, // cUSDC
];

export const ERC20_TOKENS: { address: Address; wrapper: Address }[] = [
  {
    address: CONTRACTS.USDT, // USDT
    wrapper: CONTRACTS.cUSDT, // cUSDT
  },
  {
    address: CONTRACTS.USDC, // USDC
    wrapper: CONTRACTS.cUSDC, // cUSDC
  },
];
