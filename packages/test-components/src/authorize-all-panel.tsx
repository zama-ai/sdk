"use client";

import { useAuthorizeAll, type Address } from "@zama-fhe/react-sdk";

export function AuthorizeAllPanel({ tokenAddresses }: { tokenAddresses: Address[] }) {
  const authorizeAll = useAuthorizeAll();

  return (
    <section className="space-y-2">
      <button
        onClick={() => authorizeAll.mutate(tokenAddresses)}
        disabled={authorizeAll.isPending}
        className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
        data-testid="authorize-all-button"
      >
        {authorizeAll.isPending ? "Authorizing..." : "Authorize All"}
      </button>
      {authorizeAll.isSuccess && (
        <p className="text-zama-success" data-testid="authorize-all-success">
          Authorized successfully!
        </p>
      )}
      {authorizeAll.isError && (
        <p className="text-zama-error" data-testid="authorize-all-error">
          Error: {authorizeAll.error.message}
        </p>
      )}
    </section>
  );
}
