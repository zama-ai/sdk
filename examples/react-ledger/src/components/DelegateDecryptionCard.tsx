"use client";

import { useState } from "react";
import { isAddress } from "ethers";
import { useDelegateDecryption } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/react-sdk";
import { HOODI_EXPLORER_URL } from "@/lib/config";

interface DelegateDecryptionCardProps {
  tokenAddress: Address;
  disabled: boolean;
}

export function DelegateDecryptionCard({ tokenAddress, disabled }: DelegateDecryptionCardProps) {
  const [delegateAddress, setDelegateAddress] = useState("");
  // Checked by default so a developer can grant access in one click during testing.
  const [noExpiry, setNoExpiry] = useState(true);
  const [expirationInput, setExpirationInput] = useState("");

  const delegate = useDelegateDecryption(
    { tokenAddress },
    {
      onSuccess: () => {
        setDelegateAddress("");
        setNoExpiry(true);
        setExpirationInput("");
      },
    },
  );

  const isExpiryValid = noExpiry || (!!expirationInput && new Date(expirationInput) > new Date());
  const canSubmit = isAddress(delegateAddress) && isExpiryValid;

  function handleGrant() {
    delegate.mutate({
      delegateAddress: delegateAddress as Address,
      // undefined → SDK sends MAX_UINT64 on-chain (permanent delegation).
      expirationDate: noExpiry ? undefined : new Date(expirationInput),
    });
  }

  return (
    <div className="card">
      <div className="card-title">Grant Decryption Access</div>
      <input
        className="input card-gap"
        type="text"
        value={delegateAddress}
        onChange={(e) => setDelegateAddress(e.target.value)}
        placeholder="Delegate address (0x…)"
      />
      <div className="input-row card-gap">
        <input
          className="input"
          type="datetime-local"
          value={expirationInput}
          onChange={(e) => setExpirationInput(e.target.value)}
          disabled={noExpiry}
        />
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={noExpiry}
            onChange={(e) => setNoExpiry(e.target.checked)}
          />
          No expiration
        </label>
      </div>
      {!noExpiry && !expirationInput && (
        <p className="token-meta card-gap">
          Select an expiration date and time (ACL contract requires at least 1 hour from now).
        </p>
      )}
      {!noExpiry && expirationInput && !isExpiryValid && (
        <p className="token-meta token-meta-error card-gap">Date must be in the future.</p>
      )}
      <button
        type="button"
        className="btn btn-primary btn-full"
        onClick={handleGrant}
        disabled={disabled || !canSubmit || delegate.isPending}
      >
        {delegate.isPending ? "Granting…" : "Grant Access"}
      </button>
      {delegate.isPending && <p className="token-meta">→ Confirm on your Ledger device</p>}
      {delegate.isError && (
        <div className="alert alert-error card-status">{delegate.error?.message}</div>
      )}
      {delegate.isSuccess && delegate.data?.txHash && (
        <div className="alert alert-success card-status">
          Access granted!{" "}
          <a
            href={`${HOODI_EXPLORER_URL}/tx/${delegate.data.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {delegate.data.txHash.slice(0, 10)}…
          </a>
        </div>
      )}
    </div>
  );
}
