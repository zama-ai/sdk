import type { Address } from "@zama-fhe/react-sdk";
import deployments from "../../../hardhat/deployments.json";

export const CONTRACTS = {
  USDT: "0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1",
  cUSDT: "0x06cd7788D77332cF1156f1E327eBC090B5FF16a3",
  USDC: "0x0B306BF915C4d645ff596e518fAf3F9669b97016",
  cUSDC: "0x8e80FFe6Dc044F4A766Afd6e5a8732Fe0977A493",
  transferBatcher: "0x3Aa5ebB10DC797CAC828524e59A333d0A371443c",
  feeManager: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6",
};

export const CONFIDENTIAL_TOKEN_ADDRESSES: Address[] = [
  deployments.cUSDT as Address, // cUSDT
  deployments.cToken as Address, // cUSDC
];

export const ERC20_TOKENS: { address: Address; wrapper: Address }[] = [
  {
    address: deployments.USDT as Address, // USDT
    wrapper: deployments.cUSDT as Address, // cUSDT
  },
  {
    address: deployments.erc20 as Address, // USDC
    wrapper: deployments.cToken as Address, // cUSDC
  },
];

export const DEFAULTS = {
  token: deployments.USDT, // USDT (ERC-20)
  wrapper: deployments.cUSDT, // cUSDT
  confidentialToken: deployments.cUSDT, // cUSDT
  feeManager: deployments.feeManager,
};

export const TRANSFER_BATCHER_ADDRESS = deployments.transferBatcher;
