"use client";

import { erc20BalanceKey } from "@/lib/queryKeys";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useZamaSDK } from "@zama-fhe/react-sdk";
import type { Address, TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { parseAbi, parseUnits } from "viem";

// Standard ERC-20 balanceOf ABI — parseAbi is required: viem does not parse
// human-readable ABI strings automatically.
const BALANCE_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

// mint(address, uint256) is not part of the ERC-20 standard — it is a convenience
// function added to both test tokens for easy balance top-ups during development.
const MINT_ABI = parseAbi(["function mint(address to, uint256 amount)"]);

// Reads the public ERC-20 balance of the wrapper's underlying token. Shares its query
// key with the operation cards' invalidations, so a shield/unshield/mint elsewhere
// refreshes it without any prop plumbing.
export function useUnderlyingBalance(
  token: TokenWrapperPairWithMetadata,
  account: Address,
  options?: { enabled?: boolean },
) {
  const sdk = useZamaSDK();
  return useQuery({
    queryKey: erc20BalanceKey(token.tokenAddress, account),
    queryFn: async () =>
      (await sdk.provider.readContract({
        address: token.tokenAddress,
        abi: BALANCE_ABI,
        functionName: "balanceOf",
        args: [account],
      })) as bigint,
    enabled: options?.enabled ?? true,
  });
}

// Mints 10 units of the underlying ERC-20 to the connected account (dev convenience).
export function useMintUnderlying(
  token: TokenWrapperPairWithMetadata,
  account: Address,
  options?: { onSuccess?: () => void },
) {
  const sdk = useZamaSDK();
  return useMutation({
    mutationFn: async () => {
      const signer = sdk.signer;
      if (!signer) throw new Error("Connect a wallet before minting tokens.");
      const txHash = await signer.writeContract({
        address: token.tokenAddress,
        abi: MINT_ABI,
        functionName: "mint",
        args: [account, parseUnits("10", token.underlying.decimals)],
      });
      await sdk.provider.waitForTransactionReceipt(txHash);
      return txHash;
    },
    onSuccess: options?.onSuccess,
  });
}
