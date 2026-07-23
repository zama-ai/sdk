import type { Address } from "@zama-fhe/sdk";
import { getAddress } from "ethers";

// Query key for the public ERC-20 balance. Shared between BalancesCard (which reads it)
// and the operation cards' onSuccess handlers (which invalidate it after shield/unshield/mint),
// so a self-contained BalancesCard refreshes automatically without prop-drilling the value.
export const erc20BalanceKey = (tokenAddress: Address, account: Address) =>
  ["erc20-balance", getAddress(tokenAddress) as Address, getAddress(account) as Address] as const;
