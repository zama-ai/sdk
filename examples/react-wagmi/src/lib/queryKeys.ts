import type { Address } from "@zama-fhe/sdk";
import { getAddress } from "viem";

// Query key for the public ERC-20 balance. Shared between BalancesCard (which reads it)
// and the operation cards' onSuccess handlers (which invalidate it after shield/unshield/mint),
// so a self-contained BalancesCard refreshes automatically without prop-drilling the value.
// The chain id is part of the key so a balance read on one network is never shown on another,
// even while the new network's token list is still loading.
export const erc20BalanceKey = (chainId: number, tokenAddress: Address, account: Address) =>
  ["erc20-balance", chainId, getAddress(tokenAddress), getAddress(account)] as const;
