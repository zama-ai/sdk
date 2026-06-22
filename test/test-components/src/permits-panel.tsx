"use client";

import { useHasPermit, useRevokePermits, useGrantPermit } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";

export function PermitsPanel({ tokenAddresses }: { tokenAddresses: [Address, ...Address[]] }) {
  const { data: isAllowed, isLoading } = useHasPermit({ contractAddresses: tokenAddresses });
  const { mutate: allow } = useGrantPermit();
  const revoke = useRevokePermits();
  const revokeAll = useRevokePermits();

  return (
    <div className="space-y-6" data-testid="permits-panel">
      <h2 className="text-xl font-semibold text-white">Permits</h2>

      <div className="space-y-2">
        <p className="text-sm text-zama-gray" data-testid="permits-status">
          {isLoading ? "Loading..." : `Allowed: ${isAllowed ? "true" : "false"}`}
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => allow(tokenAddresses)}
            className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover transition-colors"
            data-testid="permits-allow-button"
          >
            Allow
          </button>

          <button
            onClick={() => revoke.mutate(tokenAddresses)}
            disabled={revoke.isPending}
            className="px-4 py-2 bg-zama-surface border border-zama-border text-white font-medium rounded hover:bg-zama-border transition-colors disabled:opacity-50"
            data-testid="permits-revoke-button"
          >
            {revoke.isPending ? "Revoking..." : "Revoke"}
          </button>

          <button
            onClick={() => revokeAll.mutate()}
            disabled={revokeAll.isPending}
            className="px-4 py-2 bg-zama-surface border border-zama-border text-white font-medium rounded hover:bg-zama-border transition-colors disabled:opacity-50"
            data-testid="permits-revoke-all-button"
          >
            {revokeAll.isPending ? "Revoking..." : "Revoke All"}
          </button>
        </div>

        {revoke.isSuccess && (
          <p className="text-zama-success" data-testid="revoke-success">
            Revoked successfully
          </p>
        )}
        {revoke.isError && (
          <p className="text-zama-error" data-testid="revoke-error">
            Error: {revoke.error.message}
          </p>
        )}
        {revokeAll.isSuccess && (
          <p className="text-zama-success" data-testid="revoke-all-success">
            All permits revoked successfully
          </p>
        )}
        {revokeAll.isError && (
          <p className="text-zama-error" data-testid="revoke-all-error">
            Error: {revokeAll.error.message}
          </p>
        )}
      </div>
    </div>
  );
}
