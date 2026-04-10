"use client";

import {
  useIsAllowed,
  useRevoke,
  useRevokeSession,
  useAllow,
  type Address,
} from "@zama-fhe/react-sdk";

export function SessionPanel({ tokenAddresses }: { tokenAddresses: [Address, ...Address[]] }) {
  const { data: isAllowed, isLoading } = useIsAllowed({ contractAddresses: tokenAddresses });
  const { mutate: allow } = useAllow();
  const revoke = useRevoke();
  const revokeSession = useRevokeSession();

  return (
    <div className="space-y-6" data-testid="session-panel">
      <h2 className="text-xl font-semibold text-white">Session Management</h2>

      <div className="space-y-2">
        <p className="text-sm text-zama-gray" data-testid="session-status">
          {isLoading ? "Loading..." : `Allowed: ${isAllowed ? "true" : "false"}`}
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => allow(tokenAddresses)}
            className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover transition-colors"
            data-testid="session-allow-button"
          >
            Allow
          </button>

          <button
            onClick={() => revoke.mutate(tokenAddresses)}
            disabled={revoke.isPending}
            className="px-4 py-2 bg-zama-surface border border-zama-border text-white font-medium rounded hover:bg-zama-border transition-colors disabled:opacity-50"
            data-testid="session-revoke-button"
          >
            {revoke.isPending ? "Revoking..." : "Revoke"}
          </button>

          <button
            onClick={() => revokeSession.mutate()}
            disabled={revokeSession.isPending}
            className="px-4 py-2 bg-zama-surface border border-zama-border text-white font-medium rounded hover:bg-zama-border transition-colors disabled:opacity-50"
            data-testid="session-revoke-session-button"
          >
            {revokeSession.isPending ? "Revoking..." : "Revoke Session"}
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
        {revokeSession.isSuccess && (
          <p className="text-zama-success" data-testid="revoke-session-success">
            Session revoked successfully
          </p>
        )}
        {revokeSession.isError && (
          <p className="text-zama-error" data-testid="revoke-session-error">
            Error: {revokeSession.error.message}
          </p>
        )}
      </div>
    </div>
  );
}
