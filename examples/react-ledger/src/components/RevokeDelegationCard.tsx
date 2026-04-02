"use client";

import { useState } from "react";
import { isAddress } from "ethers";
import { useRevokeDelegation } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/react-sdk";
import { SEPOLIA_EXPLORER_URL } from "@/lib/config";

interface RevokeDelegationCardProps {
  tokenAddress: Address;
  disabled: boolean;
}

export function RevokeDelegationCard({ tokenAddress, disabled }: RevokeDelegationCardProps) {
  const [delegateAddress, setDelegateAddress] = useState("");

  const revoke = useRevokeDelegation(
    { tokenAddress },
    {
      onSuccess: () => setDelegateAddress(""),
    },
  );

  function handleRevoke() {
    revoke.mutate({ delegateAddress: delegateAddress as Address });
  }

  return (
    <div className="card">
      <div className="card-title">Revoke Decryption Access</div>
      <input
        className="input card-gap"
        type="text"
        value={delegateAddress}
        onChange={(e) => setDelegateAddress(e.target.value)}
        placeholder="Delegate address (0x…)"
      />
      <button
        type="button"
        className="btn btn-primary btn-full"
        onClick={handleRevoke}
        disabled={disabled || !isAddress(delegateAddress) || revoke.isPending}
      >
        {revoke.isPending ? "Revoking…" : "Revoke Access"}
      </button>
      {revoke.isPending && <p className="token-meta">→ Confirm on your Ledger device</p>}
      {revoke.isError && (
        <div className="alert alert-error card-status">{revoke.error?.message}</div>
      )}
      {revoke.isSuccess && revoke.data?.txHash && (
        <div className="alert alert-success card-status">
          Access revoked!{" "}
          <a
            href={`${SEPOLIA_EXPLORER_URL}/tx/${revoke.data.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {revoke.data.txHash.slice(0, 10)}…
          </a>
        </div>
      )}
    </div>
  );
}
