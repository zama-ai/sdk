"use client";

import { getAddress } from "ethers";
import { useRevokeDelegation } from "@zama-fhe/react-sdk";
import type { Address, TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { SEPOLIA_EXPLORER_URL } from "@/lib/config";

interface RevokeDelegationCardProps {
  token: TokenWrapperPairWithMetadata;
  disabled?: boolean;
}

export function RevokeDelegationCard({ token, disabled = false }: RevokeDelegationCardProps) {
  const revoke = useRevokeDelegation(token.confidentialTokenAddress);

  function submitRevoke(formData: FormData) {
    const delegateAddress = formData.get("delegateAddress") as string;
    revoke.mutate({ delegateAddress: getAddress(delegateAddress) as Address });
  }

  return (
    <section className="card" aria-labelledby="revoke-access-title">
      <h2 className="card-title" id="revoke-access-title">
        Revoke Decryption Access
      </h2>
      <form action={submitRevoke}>
        <label className="sr-only" htmlFor="revoke-delegate-address">
          Delegate address
        </label>
        <input
          id="revoke-delegate-address"
          name="delegateAddress"
          className="input card-gap"
          type="text"
          pattern="0x[a-fA-F0-9]{40}"
          title="Enter a valid address: 0x followed by 40 hexadecimal characters."
          required
          placeholder="Delegate address (0x…)"
        />
        <button
          type="submit"
          className="btn btn-primary btn-full"
          disabled={disabled || revoke.isPending}
        >
          {revoke.isPending ? "Revoking…" : "Revoke Access"}
        </button>
      </form>
      {revoke.isError && (
        <div className="alert alert-error card-status" role="alert">
          {revoke.error?.message}
        </div>
      )}
      {revoke.isSuccess && revoke.data?.txHash && (
        <output className="alert alert-success card-status">
          Access revoked!{" "}
          <a
            href={`${SEPOLIA_EXPLORER_URL}/tx/${revoke.data.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {revoke.data.txHash.slice(0, 10)}…
          </a>
        </output>
      )}
    </section>
  );
}
