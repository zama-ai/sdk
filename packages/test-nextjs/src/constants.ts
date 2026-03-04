import type { Address } from "@zama-fhe/react-sdk";
import deployments from "../../../hardhat/deployments.json";

export const CONTRACTS = {
  USDT: deployments.USDT as Address,
  cUSDT: deployments.cUSDT as Address,
  USDC: deployments.erc20 as Address,
  cUSDC: deployments.cToken as Address,
  feeManager: deployments.feeManager as Address,
  transferBatcher: deployments.transferBatcher as Address,
} as const;

export const CONFIDENTIAL_TOKEN_ADDRESSES: Address[] = [CONTRACTS.cUSDT, CONTRACTS.cUSDC];

export const ERC20_TOKENS: { address: Address; wrapper: Address }[] = [
  {
    address: CONTRACTS.USDT,
    wrapper: CONTRACTS.cUSDT,
  },
  {
    address: CONTRACTS.USDC,
    wrapper: CONTRACTS.cUSDC,
  },
];
