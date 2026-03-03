"use client";

import { useAllow, type Address } from "@zama-fhe/react-sdk";

export function AllowAllPanel({ tokenAddresses }: { tokenAddresses: Address[] }) {
  const tokenAllow = useAllow();

  return (
    <section className="space-y-2">
      <button
        onClick={() => tokenAllow.mutate(tokenAddresses)}
        disabled={tokenAllow.isPending}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        data-testid="allow-all-button"
      >
        {tokenAllow.isPending ? "Allowing..." : "Allow All"}
      </button>
      {tokenAllow.isSuccess && (
        <p className="text-green-600" data-testid="allow-all-success">
          Allowed successfully!
        </p>
      )}
      {tokenAllow.isError && (
        <p className="text-red-600" data-testid="allow-all-error">
          Error: {tokenAllow.error.message}
        </p>
      )}
    </section>
  );
}
