"use client";

import { useAllowTokens, type Address } from "@zama-fhe/react-sdk";

export function AllowAllPanel({ tokenAddresses }: { tokenAddresses: Address[] }) {
  const allowTokens = useAllowTokens();

  return (
    <section className="space-y-2">
      <button
        onClick={() => allowTokens.mutate(tokenAddresses)}
        disabled={allowTokens.isPending}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        data-testid="allow-all-button"
      >
        {allowTokens.isPending ? "Allowing..." : "Allow All"}
      </button>
      {allowTokens.isSuccess && (
        <p className="text-green-600" data-testid="allow-all-success">
          Allowed successfully!
        </p>
      )}
      {allowTokens.isError && (
        <p className="text-red-600" data-testid="allow-all-error">
          Error: {allowTokens.error.message}
        </p>
      )}
    </section>
  );
}
