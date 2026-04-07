"use client";

import {
  useDelegationStatus,
  useRevokeDelegation,
  useMetadata,
  type Address,
} from "@zama-fhe/react-sdk";

export function DelegationStatusPanel({
  tokenAddress,
  defaultDelegator,
  defaultDelegate,
}: {
  tokenAddress: Address;
  defaultDelegator?: Address;
  defaultDelegate?: Address;
}) {
  const { data: metadata } = useMetadata(tokenAddress);
  const { data: status, isLoading: statusLoading } = useDelegationStatus({
    tokenAddress,
    delegatorAddress: defaultDelegator,
    delegateAddress: defaultDelegate,
  });
  const revoke = useRevokeDelegation({ tokenAddress });

  return (
    <div className="space-y-6" data-testid="delegation-status-panel">
      <h2 className="text-xl font-semibold text-white">
        Delegation Status {metadata?.symbol ?? "..."}
      </h2>

      {/* Status section */}
      <div className="space-y-2">
        {statusLoading ? (
          <p className="text-zama-gray" data-testid="delegation-status-loading">
            Loading...
          </p>
        ) : (
          <>
            <p className="text-sm text-white" data-testid="delegation-is-delegated">
              Delegated: {status?.isDelegated === undefined ? "N/A" : String(status.isDelegated)}
            </p>
            <p className="text-sm text-white" data-testid="delegation-expiry">
              Expiry: {status?.expiryTimestamp?.toString() ?? "0"}
            </p>
          </>
        )}
      </div>

      {/* Revoke delegation section */}
      <form
        action={(formData) => {
          revoke.mutate({ delegateAddress: formData.get("delegate") as Address });
        }}
        className="space-y-4"
      >
        <h3 className="text-lg text-white">Revoke Delegation</h3>
        <input
          type="text"
          name="delegate"
          placeholder="Delegate address (0x...)"
          defaultValue={defaultDelegate ?? ""}
          required
          className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
          data-testid="revoke-delegate-input"
        />
        <button
          type="submit"
          disabled={revoke.isPending}
          className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
          data-testid="revoke-delegate-button"
        >
          {revoke.isPending ? "Revoking..." : "Revoke Delegation"}
        </button>

        {revoke.isSuccess && (
          <p className="text-zama-success" data-testid="revoke-delegate-success">
            Revoked! Tx: {revoke.data?.txHash}
          </p>
        )}
        {revoke.isError && (
          <p className="text-zama-error" data-testid="revoke-delegate-error">
            Error: {revoke.error.message}
          </p>
        )}
      </form>
    </div>
  );
}
