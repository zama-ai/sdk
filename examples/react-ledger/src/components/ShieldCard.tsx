"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { isError } from "ethers";
import {
  useZamaSDK,
  allowanceContract,
  approveContract,
  balanceOfContract,
} from "@zama-fhe/react-sdk";
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
  // "wrap"               = checking allowance or waiting for the wrap tx (no approval in progress)
  // "approve"            = waiting for the ERC-20 approval transaction
  // "wrap-after-approve" = approval confirmed, waiting for the wrap transaction
  const [phase, setPhase] = useState<"wrap" | "approve" | "wrap-after-approve">("wrap");

  const sdk = useZamaSDK();

  const parsedAmount = parseAmount(amount, decimals);
  const pendingLabel =
    phase === "approve"
      ? "Shielding… (1/2 approve)"
      : phase === "wrap-after-approve"
        ? "Shielding… (2/2 wrap)"
        : "Shielding…";

  // Spend cap strategy: approve for the user's full ERC-20 balance (not the exact shield amount).
  // This avoids re-approval on every shield — subsequent shields within the remaining cap
  // need only the wrap transaction (1 wallet confirmation). Re-approval is only triggered
  // when the requested amount exceeds the current spend cap.
  //
  // USDT-style detection (non-zero insufficient allowance case):
  // We try approve(fullBalance) directly via writeContract. writeContract uses the signer,
  // so eth_estimateGas is called with from=userAddress. For USDT-style tokens, the allowance
  // check (_allowances[userAddress][spender] > 0) causes the estimation to revert before the
  // wallet is ever prompted. We catch this and fall back to reset(0) + approve(fullBalance).
  // User rejections (ACTION_REJECTED) are re-thrown immediately — we never silently fall back
  // to the reset path when the user said no.
  const shield = useMutation({
    mutationFn: async (amount: bigint) => {
      const token = sdk.createToken(tokenAddress);
      const userAddress = await sdk.signer.getAddress();

      // Read the current ERC-20 allowance granted to the wrapper.
      const currentAllowance = (await sdk.signer.readContract(
        allowanceContract(underlyingAddress, userAddress, tokenAddress),
      )) as bigint;

      if (currentAllowance < amount) {
        // Fetch the user's full ERC-20 balance to use as the new spend cap.
        const erc20Balance = (await sdk.signer.readContract(
          balanceOfContract(underlyingAddress, userAddress),
        )) as bigint;

        setPhase("approve");

        if (currentAllowance > 0n) {
          // Non-zero insufficient allowance: try direct overwrite first.
          // - Standard ERC-20: eth_estimateGas succeeds → wallet prompted → 1 confirmation.
          // - USDT-style: eth_estimateGas reverts → caught below → reset path (2 confirmations).
          let needsReset = false;
          try {
            const approveTxHash = await sdk.signer.writeContract(
              approveContract(underlyingAddress, tokenAddress, erc20Balance),
            );
            await sdk.signer.waitForTransactionReceipt(approveTxHash);
          } catch (err) {
            if (isError(err, "ACTION_REJECTED")) throw err; // user rejected — stop here
            needsReset = true; // eth_estimateGas reverted → USDT-style token
          }

          if (needsReset) {
            const resetTxHash = await sdk.signer.writeContract(
              approveContract(underlyingAddress, tokenAddress, 0n),
            );
            await sdk.signer.waitForTransactionReceipt(resetTxHash);
            const approveTxHash = await sdk.signer.writeContract(
              approveContract(underlyingAddress, tokenAddress, erc20Balance),
            );
            await sdk.signer.waitForTransactionReceipt(approveTxHash);
          }
        } else {
          // Zero allowance: simple approve — no reset needed for any token.
          const approveTxHash = await sdk.signer.writeContract(
            approveContract(underlyingAddress, tokenAddress, erc20Balance),
          );
          await sdk.signer.waitForTransactionReceipt(approveTxHash);
        }

        setPhase("wrap-after-approve");
      }

      // approvalStrategy: 'skip' — allowance is confirmed above (or was already sufficient).
      return token.shield(amount, { approvalStrategy: "skip" });
    },
    onSuccess: () => {
      setAmount("");
      setPhase("wrap");
      onSuccess?.();
    },
  });

  function handleShield() {
    setPhase("wrap"); // reset to default; updated to "approve" inside mutation if needed
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
        type="button"
        className="btn btn-primary btn-full"
        onClick={handleShield}
        disabled={disabled || parsedAmount === 0n || shield.isPending}
      >
        {shield.isPending ? pendingLabel : "Shield"}
      </button>
      {shield.isPending && <p className="token-meta">→ Confirm on your Ledger device</p>}
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
