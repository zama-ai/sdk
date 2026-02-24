"use client";

import { useAuthorizeAll, type Address } from "@zama-fhe/react-sdk";

export function AuthorizeAllPanel({ tokenAddresses }: { tokenAddresses: Address[] }) {
  const authorizeAll = useAuthorizeAll();

  return (
    <section className="space-y-2">
      <button
        onClick={() => authorizeAll.mutate(tokenAddresses)}
        disabled={authorizeAll.isPending}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        data-testid="authorize-all-button"
      >
        {authorizeAll.isPending ? "Authorizing..." : "Authorize All"}
      </button>
      {authorizeAll.isSuccess && (
        <p className="text-green-600" data-testid="authorize-all-success">
          Authorized successfully!
        </p>
      )}
      {authorizeAll.isError && (
        <p className="text-red-600" data-testid="authorize-all-error">
          Error: {authorizeAll.error.message}
        </p>
      )}
    </section>
  );
}
