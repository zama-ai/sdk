"use client";

import { useAllow } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";

export function AllowAllPanel({ tokenAddresses }: { tokenAddresses: Address[] }) {
  const allow = useAllow();

  return (
    <section className="space-y-2">
      <button
        onClick={() => allow.mutate(tokenAddresses)}
        disabled={allow.isPending}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        data-testid="allow-all-button"
      >
        {allow.isPending ? "Allowing..." : "Allow All"}
      </button>
      {allow.isSuccess && (
        <p className="text-green-600" data-testid="allow-all-success">
          Allowed successfully!
        </p>
      )}
      {allow.isError && (
        <p className="text-red-600" data-testid="allow-all-error">
          Error: {allow.error.message}
        </p>
      )}
    </section>
  );
}
