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
  const [phase, setPhase] = useState<"prepare" | "approve" | "wrap">("prepare");

  function handleShield(formData: FormData) {
    const parsed = parseAmountSafe(formData.get("amount") as string, decimals);
    if (!parsed) {
      shield.reset();
      return;
    }
    setPhase("prepare");
    shield.mutate(
      {
        amount: parsed,
        // The SDK handles the allowance read, USDT-style reset, approval, and shield submission.
        approvalStrategy: "exact",
        onApprovalSubmitted: () => setPhase("approve"),
        onShieldSubmitted: () => setPhase("wrap"),
      },
      { onSuccess },
    );
  }

  const buttonLabel = shield.isPending
    ? phase === "approve"
      ? "Approving…"
      : "Shielding…"
    : "Shield";

  return (
    <section className="card" aria-labelledby="turnkey-shield-title">
      <h2 className="card-title" id="turnkey-shield-title">
        Shield — ERC-20 → Confidential
      </h2>
      <form action={handleShield}>
        <label className="sr-only" htmlFor="turnkey-shield-amount">
          Amount to shield
        </label>
        <div className="flex items-center gap-2 mb-3">
          <input
            id="turnkey-shield-amount"
            name="amount"
            className="input flex-1"
            type="number"
            min="0"
            step="any"
            required
            placeholder="Amount"
          />
          <span className="token-badge">{symbol}</span>
        </div>
        <button type="submit" disabled={shield.isPending} className="btn btn-primary w-full">
          {buttonLabel}
        </button>
      </form>
      <MutationStatus mutation={shield} />
    </section>
  );
}
