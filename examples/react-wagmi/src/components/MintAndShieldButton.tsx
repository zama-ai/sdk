"use client";

import { useMutation } from "@tanstack/react-query";
import { useShield, useWrappedToken, useZamaSDK } from "@zama-fhe/react-sdk";
import { decimalsContract, type Address } from "@zama-fhe/sdk";
import { parseUnits } from "viem";
import { describeError } from "@/lib/errors";
import { mintUnderlying } from "@/lib/hooks";

const MINT_AMOUNT = "10";

/** Mints the test ERC-20 behind `token`, then shields it into `token`. */
export function MintAndShieldButton({
  account,
  token,
  symbol,
}: {
  account: Address;
  token: Address;
  symbol: string;
}) {
  const sdk = useZamaSDK();
  const wrapped = useWrappedToken(token);
  const shield = useShield({ address: token });
  const mint = useMutation({
    mutationFn: async () => {
      const underlying = await wrapped.underlying();
      // Mint and shield both take the ERC-20's units, which can differ from the confidential token's.
      const decimals = await sdk.provider.readContract(decimalsContract(underlying));
      const amount = parseUnits(MINT_AMOUNT, decimals);
      await mintUnderlying(sdk, underlying, account, amount);
      try {
        await shield.mutateAsync({ amount });
      } catch (error) {
        // Say the mint went through, so a retry does not mint again by mistake.
        throw new Error(`Minted ${MINT_AMOUNT} ${symbol}, but shielding failed`, { cause: error });
      }
    },
  });

  return (
    <>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        disabled={mint.isPending}
        onClick={() => mint.mutate()}
      >
        {mint.isPending
          ? shield.isPending
            ? "Shielding…"
            : "Minting…"
          : `Mint ${MINT_AMOUNT} ${symbol}`}
      </button>
      {mint.error && (
        <span className="token-meta token-meta-error">
          {describeError(mint.error, "Mint failed")}
        </span>
      )}
    </>
  );
}
