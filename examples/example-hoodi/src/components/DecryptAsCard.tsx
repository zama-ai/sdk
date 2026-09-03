"use client";

import { useDecryptBalanceAs, useDelegationStatus } from "@zama-fhe/react-sdk";
import type { Address, TokenWrapperPairWithMetadata } from "@zama-fhe/sdk";
import { DelegationExpiredError, DelegationNotFoundError } from "@zama-fhe/sdk";
import { useActionState } from "react";
import { formatUnits, getAddress, isAddress } from "viem";

// Mirrors the SDK's MAX_UINT64 export — not yet in this app's pinned SDK
// version. Switch to importing it once the pin is bumped.
const MAX_UINT64 = 2n ** 64n - 1n;

interface DecryptAsCardProps {
  token: TokenWrapperPairWithMetadata;
  account: Address;
  disabled: boolean;
}

function formatExpiry(expiryTimestamp: bigint): string {
  if (expiryTimestamp === MAX_UINT64) return "Permanent";
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

export function DecryptAsCard({ token, account, disabled }: DecryptAsCardProps) {
  const tokenAddress = token.confidentialTokenAddress;
  const decimals = token.confidential.decimals;
  const symbol = token.confidential.symbol;

  // Note: useDecryptBalanceAs takes a positional tokenAddress argument, unlike
  // useDelegateDecryption / useRevokeDelegation which use a config object { tokenAddress }.
  // This asymmetry is a current SDK API design decision.
  const decryptAs = useDecryptBalanceAs(tokenAddress);
  const delegatorAddress = decryptAs.variables?.delegatorAddress ?? "";
  const isDelegatorAddressValid = isAddress(delegatorAddress);

  // Delegation status query — fires after a valid owner address is submitted.
  // delegatorAddress = the owner who granted the delegation.
  // delegateAddress  = the connected wallet (us).
  const delegationStatus = useDelegationStatus({
    contractAddress: tokenAddress,
    delegatorAddress: isAddress(delegatorAddress) ? delegatorAddress : undefined,
    delegateAddress: account,
  });

  const [state, submitDecrypt, isPending] = useActionState<
    { error: string } | { data: NonNullable<typeof decryptAs.data> } | null,
    FormData
  >(async (_, formData) => {
    const delegatorAddress = formData.get("delegatorAddress") as string;
    try {
      const data = await decryptAs.mutateAsync({ delegatorAddress: getAddress(delegatorAddress) });
      return { data };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return { error: delegationErrorMessage(error) };
    }
  }, null);

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
          name="delegatorAddress"
          className="input card-gap"
          type="text"
          pattern="0x[a-fA-F0-9]{40}"
          title="0x followed by 40 hexadecimal characters."
          required
          placeholder="Owner address (0x…)"
        />

        {/* Delegation status for the submitted owner */}
        {isDelegatorAddressValid && (
          <div className="delegation-status card-gap">
            {delegationStatus.isPending && (
              <span className="delegation-status-checking">Checking delegation status…</span>
            )}
            {delegationStatus.isError && (
              <span className="delegation-status-none">Unable to check delegation status</span>
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
      {state && "error" in state && (
        <div className="alert alert-error card-status" role="alert">
          {state.error}
        </div>
      )}
      {state && "data" in state && (
        <output className="alert alert-success card-status">
          {formatUnits(state.data, decimals)} {symbol}
        </output>
      )}
    </section>
  );
}
