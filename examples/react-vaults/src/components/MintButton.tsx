"use client";

import { useMutation } from "@tanstack/react-query";
import { useShield, useWrappedToken } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";
import { createWalletClient, custom, parseAbi, parseUnits } from "viem";
import { sepolia } from "viem/chains";
import { publicClient } from "@/lib/config";

// Test tokens only: the mock ERC-20 behind the vault's asset lets anyone call mint.
const MINT_ABI = parseAbi(["function mint(address to, uint256 amount)"]);
const MINT_AMOUNT = "10";

/** Mints the mock ERC-20 behind `token`, then shields it into `token`. */
export function MintButton({
  account,
  token,
  decimals,
  symbol,
}: {
  account: Address;
  token: Address;
  decimals: number;
  symbol: string;
}) {
  const wrapped = useWrappedToken(token);
  const shield = useShield({ address: token });
  const mint = useMutation({
    mutationFn: async () => {
      const ethereum = window.ethereum;
      if (!ethereum) {
        throw new Error("No browser wallet found");
      }
      const amount = parseUnits(MINT_AMOUNT, decimals);
      const walletClient = createWalletClient({
        account,
        chain: sepolia,
        transport: custom(ethereum),
      });
      const hash = await walletClient.writeContract({
        address: await wrapped.underlying(),
        abi: MINT_ABI,
        functionName: "mint",
        args: [account, amount],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await shield.mutateAsync({ amount });
    },
  });

  return (
    <>
      <button disabled={mint.isPending} onClick={() => mint.mutate()}>
        {mint.isPending
          ? shield.isPending
            ? "Shielding…"
            : "Minting…"
          : `Mint ${MINT_AMOUNT} ${symbol}`}
      </button>
      {mint.error && <p className="error">{mint.error.message}</p>}
    </>
  );
}
