import type { Address } from "@zama-fhe/sdk";
import { getAddress } from "viem";
import deployments from "../../../contracts/deployments.json";

export const CONTRACTS = {
  USDT: getAddress(deployments.USDT),
  cUSDT: getAddress(deployments.cUSDT),
  USDC: getAddress(deployments.erc20),
  cUSDC: getAddress(deployments.cToken),
} as const;

export const CONFIDENTIAL_TOKEN_ADDRESSES: [Address, ...Address[]] = [
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
