"use client";

import { useActionState, useState } from "react";
import { getAddress } from "viem";
import { useDelegateDecryption } from "@zama-fhe/react-sdk";
import type { TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { SEPOLIA_EXPLORER_URL } from "@/lib/config";

// Mirrors the SDK's WILDCARD_CONTRACT export — not yet in this app's pinned
// SDK version. Switch to importing it once the pin is bumped.
const WILDCARD_CONTRACT = "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF";

interface DelegateDecryptionCardProps {
  token: TokenWrapperPairWithMetadata;
  disabled?: boolean;
}

export function DelegateDecryptionCard({ token, disabled = false }: DelegateDecryptionCardProps) {
  // A wildcard grant makes any existing per-token delegation to the same
  // delegate redundant.
  const [allContracts, setAllContracts] = useState(false);
  const delegate = useDelegateDecryption(
    allContracts ? WILDCARD_CONTRACT : token.confidentialTokenAddress,
  );

  // datetime-local min: one hour from now, in the browser's local wall-clock time.
  const minExpiration = new Date(
    Date.now() + 60 * 60 * 1000 - new Date().getTimezoneOffset() * 60 * 1000,
  )
    .toISOString()
    .slice(0, 16);

  const [state, submitGrant, isPending] = useActionState<
    { error: string } | { data: NonNullable<typeof delegate.data> } | null,
    FormData
  >(async (_, formData) => {
    const delegateAddress = formData.get("delegateAddress") as string;
    const noExpiry = formData.has("noExpiry");
    const expirationInput = formData.get("expirationDate") as string;
    if (!noExpiry && new Date(expirationInput).getTime() <= Date.now() + 60 * 60 * 1000) {
      return { error: "Choose an expiration date at least 1 hour in the future." };
    }
    try {
      const data = await delegate.mutateAsync({
        delegateAddress: getAddress(delegateAddress),
        // undefined → SDK sends MAX_UINT64 on-chain (permanent, no expiry).
        expirationDate: noExpiry ? undefined : new Date(expirationInput),
      });
      return { data };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return { error: error.message };
    }
  }, null);

  return (
    <section className="card" aria-labelledby="grant-access-title">
      <h2 className="card-title" id="grant-access-title">
        Grant Decryption Access
      </h2>
      <form action={submitGrant}>
        <label className="sr-only" htmlFor="delegate-address">
          Delegate address
        </label>
        <input
          id="delegate-address"
          name="delegateAddress"
          className="input card-gap"
          type="text"
          pattern="0x[a-fA-F0-9]{40}"
          title="0x followed by 40 hexadecimal characters."
          required
          placeholder="Delegate address (0x…)"
        />
        <div className="input-row card-gap">
          <input
            name="expirationDate"
            className="input"
            type="datetime-local"
            min={minExpiration}
            title="Expiration must be at least one hour in the future."
          />
          <label className="checkbox-label">
            <input name="noExpiry" type="checkbox" defaultChecked />
            No expiration
          </label>
        </div>
        <p className="token-meta card-gap">Expiration must be at least one hour from now.</p>
        <label className="checkbox-label card-gap">
          <input
            name="allContracts"
            type="checkbox"
            checked={allContracts}
            onChange={(e) => setAllContracts(e.target.checked)}
          />
          Delegate for all contracts (wildcard)
        </label>
        {allContracts && (
          <p className="token-meta card-gap">
            Grants access across every confidential contract this wallet owns, not just{" "}
            {token.confidential.symbol}. Skip per-token delegations to this delegate once granted.
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-full" disabled={disabled || isPending}>
          {isPending ? "Granting…" : "Grant Access"}
        </button>
      </form>
      {state && "error" in state && (
        <div className="alert alert-error card-status" role="alert">
          {state.error}
        </div>
      )}
      {state && "data" in state && state.data.txHash && (
        <output className="alert alert-success card-status">
          Access granted!{" "}
          <a
            href={`${SEPOLIA_EXPLORER_URL}/tx/${state.data.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {state.data.txHash.slice(0, 10)}…
          </a>
        </output>
      )}
    </section>
  );
}
