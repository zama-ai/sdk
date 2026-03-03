import type { Address } from "@zama-fhe/react-sdk";
import deployments from "../../../hardhat/deployments.json" with { type: "json" };

export const CONTRACTS = {
  USDT: deployments.USDT as Address,
  cUSDT: deployments.cUSDT as Address,
  USDC: deployments.erc20 as Address,
  cUSDC: deployments.cToken as Address,
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
