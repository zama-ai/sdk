import type { Address } from "@zama-fhe/react-sdk";
import deployments from "../../../hardhat/deployments.json" with { type: "json" };

export const CONTRACTS = {
  USDT: deployments.USDT as Address,
  cUSDT: deployments.cUSDT as Address,
  USDC: deployments.erc20 as Address,
  cUSDC: deployments.cToken as Address,
  feeManager: deployments.feeManager as Address,
  transferBatcher: deployments.transferBatcher as Address,
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
