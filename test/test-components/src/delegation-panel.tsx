"use client";

import { useDelegateDecryption, useDecryptBalanceAs, useMetadata } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";

export function DelegationPanel({
  tokenAddress,
  defaultDelegate,
  defaultDelegator,
}: {
  tokenAddress: Address;
  defaultDelegate?: Address;
  defaultDelegator?: Address;
}) {
  const { data: metadata } = useMetadata(tokenAddress);
  const delegate = useDelegateDecryption({ tokenAddress });
  const decryptAs = useDecryptBalanceAs(tokenAddress);

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-white">Delegation {metadata?.symbol ?? "..."}</h2>

      {/* Section 1: Delegate */}
      <form
        action={(formData) => {
          delegate.mutate({ delegateAddress: formData.get("delegate") as Address });
        }}
        className="space-y-4"
      >
        <h3 className="text-lg text-white">Delegate Decryption</h3>
        <input
          type="text"
          name="delegate"
          placeholder="Delegate address (0x...)"
          defaultValue={defaultDelegate ?? ""}
          required
          className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
          data-testid="delegate-input"
        />
        <button
          type="submit"
          disabled={delegate.isPending}
          className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
          data-testid="delegate-button"
        >
          {delegate.isPending ? "Delegating..." : "Delegate"}
        </button>

        {delegate.isSuccess && (
          <p className="text-zama-success" data-testid="delegate-success">
            Delegated! Tx: {delegate.data?.txHash}
          </p>
        )}
        {delegate.isError && (
          <p className="text-zama-error" data-testid="delegate-error">
            Error: {delegate.error.message}
          </p>
        )}
      </form>

      {/* Section 2: Decrypt as Delegate */}
      <form
        action={(formData) => {
          decryptAs.mutate({ delegatorAddress: formData.get("delegator") as Address });
        }}
        className="space-y-4"
      >
        <h3 className="text-lg text-white">Decrypt as Delegate</h3>
        <input
          type="text"
          name="delegator"
          placeholder="Delegator address (0x...)"
          defaultValue={defaultDelegator ?? ""}
          required
          className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
          data-testid="delegator-input"
        />
        <button
          type="submit"
          disabled={decryptAs.isPending}
          className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
          data-testid="decrypt-delegate-button"
        >
          {decryptAs.isPending ? "Decrypting..." : "Decrypt as Delegate"}
        </button>

        {decryptAs.isSuccess && (
          <p className="text-zama-success" data-testid="delegated-balance">
            {decryptAs.data.toString()}
          </p>
        )}
        {decryptAs.isError && (
          <p className="text-zama-error" data-testid="decrypt-delegate-error">
            Error: {decryptAs.error.message}
          </p>
        )}
      </form>
    </div>
  );
}
