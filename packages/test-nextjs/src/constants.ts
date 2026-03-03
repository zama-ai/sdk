import type { Address } from "@zama-fhe/react-sdk";
import deployments from "../../../hardhat/deployments.json";

export const CONTRACTS = {
  USDT: deployments.USDT as Address, // USDT (ERC-20)
  cUSDT: deployments.cUSDT as Address, // cUSDT
  USDC: deployments.erc20 as Address, // USDC
  cUSDC: deployments.cToken as Address, // cUSDC
  feeManager: deployments.feeManager as Address,
  transferBatcher: deployments.transferBatcher as Address,
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
