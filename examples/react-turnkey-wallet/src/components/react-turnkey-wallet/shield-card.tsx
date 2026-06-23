import { useState } from "react";
import { useShield } from "@zama-fhe/react-sdk";
import type { Address } from "viem";
import { parseAmountSafe } from "@/lib/react-turnkey-wallet/utils";
import { MutationStatus } from "./mutation-status";

export function ShieldCard({
  tokenAddress,
  decimals,
  symbol,
  onSuccess,
}: {
  tokenAddress: Address;
  decimals: number;
  symbol: string;
  onSuccess: () => void;
}) {
  const shield = useShield({ address: tokenAddress });
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<"prepare" | "approve" | "wrap">("prepare");

  function handleShield() {
    const parsed = parseAmountSafe(amount, decimals);
    if (!parsed) return;
    setPhase("prepare");
    shield.mutate(
      {
        amount: parsed,
        // The SDK handles the allowance read, USDT-style reset, approval, and shield submission.
        approvalStrategy: "exact",
        onApprovalSubmitted: () => setPhase("approve"),
        onShieldSubmitted: () => setPhase("wrap"),
      },
      {
        onSuccess: () => {
          setAmount("");
          onSuccess();
        },
      },
    );
  }

  const buttonLabel = shield.isPending
    ? phase === "approve"
      ? "Approving…"
      : "Shielding…"
    : "Shield";

  return (
    <div className="card">
      <div className="card-title">Shield — ERC-20 → Confidential</div>
      <div className="flex items-center gap-2 mb-3">
        <input
          className="input flex-1"
          type="number"
          min="0"
          placeholder="Amount"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <span className="token-badge">{symbol}</span>
      </div>
      <button
        onClick={handleShield}
        disabled={shield.isPending || !parseAmountSafe(amount, decimals)}
        className="btn btn-primary w-full"
      >
        {buttonLabel}
      </button>
      <MutationStatus mutation={shield} />
    </div>
  );
}
