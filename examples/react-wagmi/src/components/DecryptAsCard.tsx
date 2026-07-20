"use client";

import { useActionState } from "react";
import { getAddress, isAddress, formatUnits } from "viem";
import { useDelegationStatus, useDecryptBalanceAs } from "@zama-fhe/react-sdk";
import { DelegationExpiredError, DelegationNotFoundError, type Address } from "@zama-fhe/sdk";

// Sentinel value used by the ACL contract to represent permanent (no-expiry) delegations.
// The SDK sends this on-chain when expirationDate is undefined. Not exported by the SDK —
// if this value changes in a future SDK version, formatExpiry will silently display wrong dates.
// Track: https://github.com/zama-ai/sdk/issues (search PERMANENT_DELEGATION) for a public export.
const PERMANENT_DELEGATION = 2n ** 64n - 1n;

interface DecryptAsCardProps {
  tokenAddress: Address;
  decimals: number;
  symbol: string;
  disabled: boolean;
  connectedAddress: Address;
}

function formatExpiry(expiryTimestamp: bigint): string {
  if (expiryTimestamp === PERMANENT_DELEGATION) return "Permanent";
  return new Date(Number(expiryTimestamp) * 1000).toLocaleString();
}

function delegationErrorMessage(error: Error): string {
  if (error instanceof DelegationNotFoundError) {
    return "No delegation found — ask the owner to grant you access first.";
  }
  if (error instanceof DelegationExpiredError) {
    return "Delegation has expired — ask the owner to renew it.";
  }
  return error.message;
}

export function DecryptAsCard({
  tokenAddress,
  decimals,
  symbol,
  disabled,
  connectedAddress,
}: DecryptAsCardProps) {
  const decryptAs = useDecryptBalanceAs(tokenAddress);
  const delegatorAddress = decryptAs.variables?.delegatorAddress ?? "";
  const ownerIsValid = isAddress(delegatorAddress);

  // Delegation status query — fires after a valid owner address is submitted.
  // delegatorAddress = the owner who granted the delegation.
  // delegateAddress  = the connected wallet (us).
  const delegationStatus = useDelegationStatus({
    contractAddress: tokenAddress,
    delegatorAddress: ownerIsValid ? delegatorAddress : undefined,
    delegateAddress: connectedAddress,
  });

  const [errorMessage, submitDecrypt, isPending] = useActionState<string | null, FormData>(
    async (_, formData) => {
      const ownerAddress = formData.get("ownerAddress") as string;
      try {
        await decryptAs.mutateAsync({ delegatorAddress: getAddress(ownerAddress) });
        return null;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        return delegationErrorMessage(error);
      }
    },
    null,
  );

  return (
    <section className="card" aria-labelledby="decrypt-as-title">
      <h2 className="card-title" id="decrypt-as-title">
        Decrypt Balance On Behalf Of
      </h2>
      <form action={submitDecrypt}>
        <label className="sr-only" htmlFor="delegator-address">
          Owner address
        </label>
        <input
          id="delegator-address"
          name="ownerAddress"
          className="input card-gap"
          type="text"
          pattern="0x[a-fA-F0-9]{40}"
          title="Enter a valid address: 0x followed by 40 hexadecimal characters."
          placeholder="Owner address (0x…)"
          required
        />

        {/* Delegation status for the submitted owner */}
        {ownerIsValid && (
          <div className="delegation-status card-gap">
            {delegationStatus.isPending && (
              <span className="delegation-status-checking">Checking delegation status…</span>
            )}
            {delegationStatus.isError && (
              <span className="delegation-status-none">
                Unable to check delegation status: {delegationStatus.error?.message}
              </span>
            )}
            {delegationStatus.data?.isActive && (
              <span className="delegation-status-active">
                ✓ Delegated · {formatExpiry(delegationStatus.data.expiryTimestamp)}
              </span>
            )}
            {delegationStatus.data && !delegationStatus.data.isActive && (
              <span className="delegation-status-none">No active delegation for this token</span>
            )}
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-full" disabled={disabled || isPending}>
          {isPending ? "Decrypting…" : "Decrypt Balance"}
        </button>
      </form>
      {errorMessage && (
        <div className="alert alert-error card-status" role="alert">
          {errorMessage}
        </div>
      )}
      {decryptAs.isSuccess && decryptAs.data !== undefined && (
        <output className="alert alert-success card-status">
          {formatUnits(decryptAs.data, decimals)} {symbol}
        </output>
      )}
    </section>
  );
}
