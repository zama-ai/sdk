import type { Address } from "@zama-fhe/react-sdk";
import deployments from "../../../contracts/deployments.json";

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
  token: deployments.USDT as Address, // USDT (ERC-20)
  wrapper: deployments.cUSDT as Address, // cUSDT
  confidentialToken: deployments.cUSDT as Address, // cUSDT
};

export const TRANSFER_BATCHER_ADDRESS = deployments.transferBatcher as Address;
