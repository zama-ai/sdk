"use client";

import { useState } from "react";
import { isAddress, formatUnits } from "ethers";
import { useDelegationStatus, useDecryptBalanceAs } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/react-sdk";
import { DelegationNotFoundError, DelegationExpiredError } from "@zama-fhe/sdk";

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
  if (error instanceof DelegationNotFoundError)
    return "No delegation found — ask the owner to grant you access first.";
  if (error instanceof DelegationExpiredError)
    return "Delegation has expired — ask the owner to renew it.";
  return error.message;
}

export function DecryptAsCard({
  tokenAddress,
  decimals,
  symbol,
  disabled,
  connectedAddress,
}: DecryptAsCardProps) {
  const [ownerAddress, setOwnerAddress] = useState("");

  const ownerIsValid = isAddress(ownerAddress);

  // Live delegation status query — only fires when a valid owner address is entered.
  // delegatorAddress = the owner who granted the delegation.
  // delegateAddress  = the connected wallet (us).
  const delegationStatus = useDelegationStatus({
    tokenAddress,
    delegatorAddress: ownerIsValid ? (ownerAddress as Address) : undefined,
    delegateAddress: connectedAddress,
  });

  // Note: useDecryptBalanceAs takes a positional tokenAddress argument, unlike
  // useDelegateDecryption / useRevokeDelegation which use a config object { tokenAddress }.
  // This asymmetry is a current SDK API design decision.
  const decryptAs = useDecryptBalanceAs(tokenAddress);

  function handleDecrypt() {
    decryptAs.mutate({ delegatorAddress: ownerAddress as Address });
  }

  return (
    <div className="card">
      <div className="card-title">Decrypt Balance On Behalf Of</div>
      <input
        className="input card-gap"
        type="text"
        value={ownerAddress}
        onChange={(e) => {
          setOwnerAddress(e.target.value);
          decryptAs.reset();
        }}
        placeholder="Owner address (0x…)"
      />

      {/* Live delegation status — shown as soon as a valid address is entered */}
      {ownerIsValid && (
        <div className="delegation-status card-gap">
          {delegationStatus.isPending && (
            <span className="delegation-status-checking">Checking delegation status…</span>
          )}
          {delegationStatus.isError && (
            <span className="delegation-status-none">Unable to check delegation status</span>
          )}
          {delegationStatus.data?.isDelegated && (
            <span className="delegation-status-active">
              ✓ Delegated · {formatExpiry(delegationStatus.data.expiryTimestamp)}
            </span>
          )}
          {delegationStatus.data && !delegationStatus.data.isDelegated && (
            <span className="delegation-status-none">No active delegation for this token</span>
          )}
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary btn-full"
        onClick={handleDecrypt}
        disabled={disabled || !ownerIsValid || decryptAs.isPending}
      >
        {decryptAs.isPending ? "Decrypting…" : "Decrypt Balance"}
      </button>
      {decryptAs.isError && (
        <div className="alert alert-error card-status">
          {delegationErrorMessage(decryptAs.error)}
        </div>
      )}
      {decryptAs.isSuccess && decryptAs.data !== undefined && (
        <div className="alert alert-success card-status">
          {formatUnits(decryptAs.data, decimals)} {symbol}
        </div>
      )}
    </div>
  );
}
