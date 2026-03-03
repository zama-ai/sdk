import type { Address } from "@zama-fhe/react-sdk";
import deployments from "../../../hardhat/deployments.json";

const DEPLOYMENTS = {
  USDT: deployments.USDT as Address,
  cUSDT: deployments.cUSDT as Address,
  erc20: deployments.erc20 as Address,
  cToken: deployments.cToken as Address,
  feeManager: deployments.feeManager as Address,
  transferBatcher: deployments.transferBatcher as Address,
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
