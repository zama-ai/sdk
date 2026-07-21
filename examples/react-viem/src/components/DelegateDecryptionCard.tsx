"use client";

import { useActionState } from "react";
import { getAddress } from "viem";
import { useDelegateDecryption } from "@zama-fhe/react-sdk";
import type { TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { SEPOLIA_EXPLORER_URL } from "@/lib/config";

interface DelegateDecryptionCardProps {
  token: TokenWrapperPairWithMetadata;
  disabled?: boolean;
}

export function DelegateDecryptionCard({ token, disabled = false }: DelegateDecryptionCardProps) {
  const delegate = useDelegateDecryption(token.confidentialTokenAddress);

  const [errorMessage, submitGrant, isPending] = useActionState<string | null, FormData>(
    async (_, formData) => {
      const delegateAddress = formData.get("delegateAddress") as string;
      const noExpiry = formData.has("noExpiry");
      const expirationInput = formData.get("expirationDate") as string;
      if (!noExpiry && new Date(expirationInput).getTime() <= Date.now() + 60 * 60 * 1000) {
        return "Choose an expiration date at least 1 hour in the future.";
      }
      try {
        await delegate.mutateAsync({
          delegateAddress: getAddress(delegateAddress),
          // undefined → SDK sends PERMANENT_DELEGATION on-chain (permanent, no expiry).
          expirationDate: noExpiry ? undefined : new Date(expirationInput),
        });
        return null;
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        return error.message;
      }
    },
    null,
  );

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
          title="Enter a valid address: 0x followed by 40 hexadecimal characters."
          required
          placeholder="Delegate address (0x…)"
        />
        <div className="input-row card-gap">
          <input name="expirationDate" className="input" type="datetime-local" />
          <label className="checkbox-label">
            <input name="noExpiry" type="checkbox" defaultChecked />
            No expiration
          </label>
        </div>
        <p className="token-meta card-gap">Expiration must be at least one hour from now.</p>
        <button type="submit" className="btn btn-primary btn-full" disabled={disabled || isPending}>
          {isPending ? "Granting…" : "Grant Access"}
        </button>
      </form>
      {errorMessage && (
        <div className="alert alert-error card-status" role="alert">
          {errorMessage}
        </div>
      )}
      {delegate.isSuccess && delegate.data?.txHash && (
        <output className="alert alert-success card-status">
          Access granted!{" "}
          <a
            href={`${SEPOLIA_EXPLORER_URL}/tx/${delegate.data.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {delegate.data.txHash.slice(0, 10)}…
          </a>
        </output>
      )}
    </section>
  );
}
