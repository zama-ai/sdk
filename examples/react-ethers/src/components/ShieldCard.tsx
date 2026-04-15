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
import { balanceErrorMessage } from "@/lib/balanceError";
import { SEPOLIA_EXPLORER_URL } from "@/lib/config";

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

  // Spend cap strategy: approve the user's full ERC-20 balance as the new spend cap.
  // This avoids re-approval on subsequent shields that stay within the remaining cap.
  //
  // USDT-style tokens (e.g. the USDT Mock used here) implement a front-running guard
  // from the original Tether contract: approve(spender, newAmount) reverts when the
  // current allowance is non-zero. The ERC-20 spec allows this but it is NOT the
  // OpenZeppelin default. The workaround is to reset to 0 first, then set the real
  // allowance — two wallet confirmations instead of one.
  //
  // Detection: eth_estimateGas on the overwrite call reverts before the wallet is ever
  // prompted. We catch that revert and fall back to the reset path. User rejections
  // (ACTION_REJECTED) are re-thrown immediately — no silent fallback.
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
          // Non-zero insufficient allowance — try a direct overwrite first.
          // Standard tokens: estimateGas succeeds → one wallet confirmation.
          // USDT-style tokens: estimateGas reverts → fall back to reset path below.
          let needsReset = false;
          let overwriteTxHash: `0x${string}` | undefined;
          try {
            // Only writeContract (which internally runs estimateGas) is inside the
            // try block. If estimateGas reverts, writeContract throws before any tx
            // is submitted → USDT-style token detected. waitForTransactionReceipt is
            // intentionally outside: a receipt error (on-chain revert, timeout) should
            // propagate as a real error, not silently trigger the USDT reset path.
            overwriteTxHash = await sdk.signer.writeContract(
              approveContract(underlyingAddress, tokenAddress, erc20Balance),
            );
          } catch (err) {
            if (isError(err, "ACTION_REJECTED")) throw err; // user said no — stop here
            if (!isError(err, "CALL_EXCEPTION")) throw err; // re-throw non-revert errors
            needsReset = true; // estimateGas reverted → USDT-style token
          }
          if (overwriteTxHash) {
            await sdk.signer.waitForTransactionReceipt(overwriteTxHash);
          }

          if (needsReset) {
            // USDT-style reset path: approve(0) then approve(fullBalance) — two confirmations.
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
          // Zero allowance — any token type accepts a direct approve from 0.
          const txHash = await sdk.signer.writeContract(
            approveContract(underlyingAddress, tokenAddress, erc20Balance),
          );
          await sdk.signer.waitForTransactionReceipt(txHash);
        }

        setPhase("wrap-after-approve");
      }

      // ── SDK call ────────────────────────────────────────────────────────────────
      // Allowance is confirmed above (or was already sufficient) — tell the SDK to
      // skip its own approval and go straight to the on-chain wrap.
      return token.shield(amount, { approvalStrategy: "skip" });
    },
    onSuccess,
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
      {shield.isError && shield.error && (
        <div className="alert alert-error card-status">
          {balanceErrorMessage(shield.error, decimals, symbol)}
        </div>
      )}
      {shield.isSuccess && shield.data?.txHash && (
        <div className="alert alert-success card-status">
          Shielded!{" "}
          <a
            href={`${SEPOLIA_EXPLORER_URL}/tx/${shield.data.txHash}`}
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
