import type { Address } from "@zama-fhe/sdk";
import { getAddress } from "viem";
import deployments from "../../../contracts/deployments.json";

export const CONFIDENTIAL_TOKEN_ADDRESSES: [Address, ...Address[]] = [
  getAddress(deployments.cUSDT), // cUSDT
  getAddress(deployments.cToken), // cUSDC
];

export const ERC20_TOKENS: { address: Address; wrapper: Address }[] = [
  {
    address: getAddress(deployments.USDT), // USDT
    wrapper: getAddress(deployments.cUSDT), // cUSDT
  },
  {
    address: getAddress(deployments.erc20), // USDC
    wrapper: getAddress(deployments.cToken), // cUSDC
  },
];

export const DEFAULTS = {
  token: getAddress(deployments.USDT), // USDT (ERC-20)
  wrapper: getAddress(deployments.cUSDT), // cUSDT
  confidentialToken: getAddress(deployments.cUSDT), // cUSDT
};
