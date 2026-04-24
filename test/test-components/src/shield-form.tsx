"use client";

import type { Address } from "@zama-fhe/sdk";
import { useShield, useUnderlyingAllowance, useMetadata } from "@zama-fhe/react-sdk";
import { useAccount } from "wagmi";

export function ShieldForm({
  tokenAddress,
  wrapperAddress,
}: {
  tokenAddress: Address;
  wrapperAddress: Address;
}) {
  const { address } = useAccount();
  const { data: metadata } = useMetadata(tokenAddress);
  const { data: allowance } = useUnderlyingAllowance({
    tokenAddress,
    wrapperAddress,
    owner: address,
  });
  const shield = useShield({ tokenAddress, wrapperAddress });

  return (
    <form
      action={(formData) => {
        shield.mutate({ amount: BigInt(formData.get("amount") as string) });
      }}
      className="space-y-4"
      data-testid="shield-form"
    >
      <h2 className="text-xl font-semibold text-white">Shield {metadata?.symbol ?? "..."}</h2>

      {allowance !== undefined && (
        <p className="text-sm text-zama-gray" data-testid="allowance">
          Current allowance: {allowance.toString()}
        </p>
      )}

      <input
        type="text"
        name="amount"
        placeholder="Amount"
        required
        className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
        data-testid="amount-input"
      />

      <button
        type="submit"
        disabled={shield.isPending}
        className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
        data-testid="shield-button"
      >
        {shield.isPending ? "Shielding..." : "Shield"}
      </button>

      {shield.isSuccess && (
        <p className="text-zama-success" data-testid="shield-success">
          Shielded successfully! Tx: {shield.data?.txHash}
        </p>
      )}

      {shield.isError && (
        <p className="text-zama-error" data-testid="shield-error">
          Error: {shield.error.message}
        </p>
      )}
    </form>
  );
}
