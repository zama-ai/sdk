import type { Address } from "@zama-fhe/react-sdk";

const DEPLOYMENTS = {
  USDT: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6" as Address,
  cUSDT: "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762" as Address,
  erc20: "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853" as Address,
  cToken: "0x3B02fF1e626Ed7a8fd6eC5299e2C54e1421B626B" as Address,
  feeManager: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
  transferBatcher: "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82" as Address,
} as const;

export const CONFIDENTIAL_TOKEN_ADDRESSES: Address[] = [
  DEPLOYMENTS.cUSDT, // cUSDT
  DEPLOYMENTS.cToken, // cUSDC
];

export const ERC20_TOKENS: { address: Address; wrapper: Address }[] = [
  {
    address: DEPLOYMENTS.USDT, // USDT
    wrapper: DEPLOYMENTS.cUSDT, // cUSDT
  },
  {
    address: DEPLOYMENTS.erc20, // USDC
    wrapper: DEPLOYMENTS.cToken, // cUSDC
  },
];

export const DEFAULTS = {
  token: DEPLOYMENTS.USDT, // USDT (ERC-20)
  wrapper: DEPLOYMENTS.cUSDT, // cUSDT
  confidentialToken: DEPLOYMENTS.cUSDT, // cUSDT
  feeManager: DEPLOYMENTS.feeManager,
};

export const TRANSFER_BATCHER_ADDRESS = DEPLOYMENTS.transferBatcher;
