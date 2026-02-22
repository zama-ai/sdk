"use client";

import {
  useShield,
  useUnderlyingAllowance,
  useTokenMetadata,
  type Address,
} from "@zama-fhe/token-react-sdk";

export function ShieldForm({
  tokenAddress,
  wrapperAddress,
}: {
  tokenAddress: Address;
  wrapperAddress: Address;
}) {
  const { data: metadata } = useTokenMetadata(tokenAddress);
  const { data: allowance } = useUnderlyingAllowance({ tokenAddress, wrapperAddress });
  const shield = useShield({ tokenAddress, wrapperAddress });

  return (
    <form
      action={(formData) => {
        shield.mutate({ amount: BigInt(formData.get("amount") as string) });
      }}
      className="space-y-4"
      data-testid="shield-form"
    >
      <h2 className="text-xl font-semibold">Shield {metadata?.symbol ?? "..."}</h2>

      {allowance !== undefined && (
        <p className="text-sm text-gray-600" data-testid="allowance">
          Current allowance: {allowance.toString()}
        </p>
      )}

      <input
        type="text"
        name="amount"
        placeholder="Amount"
        required
        className="w-full px-3 py-2 border rounded"
        data-testid="amount-input"
      />

      <button
        type="submit"
        disabled={shield.isPending}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        data-testid="shield-button"
      >
        {shield.isPending ? "Shielding..." : "Shield"}
      </button>

      {shield.isSuccess && (
        <p className="text-green-600" data-testid="shield-success">
          Shielded successfully! Tx: {shield.data}
        </p>
      )}

      {shield.isError && (
        <p className="text-red-600" data-testid="shield-error">
          Error: {shield.error.message}
        </p>
      )}
    </form>
  );
}
