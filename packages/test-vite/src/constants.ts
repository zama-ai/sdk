import type { Address } from "@zama-fhe/react-sdk";

export const CONFIDENTIAL_TOKEN_ADDRESSES: Address[] = [
  "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762", // cUSDT
  "0x3B02fF1e626Ed7a8fd6eC5299e2C54e1421B626B", // cUSDC
];

export const ERC20_TOKENS: { address: Address; wrapper: Address }[] = [
  {
    address: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6", // USDT
    wrapper: "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762", // cUSDT
  },
  {
    address: "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853", // USDC
    wrapper: "0x3B02fF1e626Ed7a8fd6eC5299e2C54e1421B626B", // cUSDC
  },
];

export const DEFAULTS = {
  token: "0x610178dA211FEF7D417bC0e6FeD39F05609AD788" as Address, // USDT (ERC-20)
  wrapper: "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762" as Address, // cUSDT
  confidentialToken: "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762" as Address, // cUSDT
  feeManager: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
};

export const TRANSFER_BATCHER_ADDRESS = "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82" as Address;
