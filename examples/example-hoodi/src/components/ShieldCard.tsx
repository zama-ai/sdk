"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useZamaSDK, allowanceContract, approveContract } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/react-sdk";
import { parseAmount } from "@/lib/parseAmount";
import { HOODI_EXPLORER_URL } from "@/lib/config";

interface ShieldCardProps {
  tokenAddress: Address;
  /** ERC-20 address of the underlying token (the `erc20` side of the pair). */
  underlyingAddress: Address;
  decimals: number;
  symbol: string;
  disabled: boolean;
  onSuccess?: () => void;
}

export function ShieldCard({
  tokenAddress,
  underlyingAddress,
  decimals,
  symbol,
  disabled,
  onSuccess,
}: ShieldCardProps) {
  const [amount, setAmount] = useState("");
  // "approve" = waiting for ERC-20 approval tx(s), "shield" = waiting for wrap tx.
  const [phase, setPhase] = useState<"approve" | "shield">("approve");

  const sdk = useZamaSDK();

  const parsedAmount = parseAmount(amount, decimals);
  const pendingLabel = phase === "shield" ? "Shielding… (2/2 wrap)" : "Shielding… (1/2 approve)";

  // Note: we manage approval manually rather than using the useApproveUnderlying hook
  // so we can display separate "1/2 approve" and "2/2 wrap" labels during the flow,
  // and handle the USDT-style zero-reset without the hook's opaque pending state.
  const shield = useMutation({
    mutationFn: async (amount: bigint) => {
      const token = sdk.createToken(tokenAddress);
      const userAddress = await sdk.signer.getAddress();

      // Read the current ERC-20 allowance granted to the wrapper.
      const currentAllowance = (await sdk.signer.readContract(
        allowanceContract(underlyingAddress, userAddress, tokenAddress),
      )) as bigint;

      if (currentAllowance < amount) {
        // Some tokens (USDT-style) revert if you approve a non-zero amount while a non-zero
        // allowance is already set. Reset to 0 first, waiting for the receipt so the reset
        // is confirmed on-chain before the new approval is estimated and submitted.
        if (currentAllowance > 0n) {
          const resetTxHash = await sdk.signer.writeContract(
            approveContract(underlyingAddress, tokenAddress, 0n),
          );
          await sdk.signer.waitForTransactionReceipt(resetTxHash);
        }
        const approveTxHash = await sdk.signer.writeContract(
          approveContract(underlyingAddress, tokenAddress, amount),
        );
        await sdk.signer.waitForTransactionReceipt(approveTxHash);
      }

      setPhase("shield");

      // approvalStrategy: 'skip' — approval is already confirmed above (or was sufficient).
      return token.shield(amount, { approvalStrategy: "skip" });
    },
    onSuccess,
  });

  function handleShield() {
    setPhase("approve");
    shield.mutate(parsedAmount);
  }

  return (
    <div className="card">
      <div className="card-title">Shield — ERC-20 → Confidential</div>
      <div className="input-row card-gap">
        <input
          className="input"
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />
        <span className="input-unit">{symbol}</span>
      </div>
      <button
        className="btn btn-primary btn-full"
        onClick={handleShield}
        disabled={disabled || parsedAmount === 0n || shield.isPending}
      >
        {shield.isPending ? pendingLabel : "Shield"}
      </button>
      {shield.isError && (
        <div className="alert alert-error card-status">{shield.error?.message}</div>
      )}
      {shield.isSuccess && shield.data?.txHash && (
        <div className="alert alert-success card-status">
          Shielded!{" "}
          <a
            href={`${HOODI_EXPLORER_URL}/tx/${shield.data.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {shield.data.txHash.slice(0, 10)}…
          </a>
        </div>
      )}
    </div>
  );
}
