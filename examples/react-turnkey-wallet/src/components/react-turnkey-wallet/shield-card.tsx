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
  preApprove,
}: {
  tokenAddress: Address;
  decimals: number;
  symbol: string;
  onSuccess: () => void;
  preApprove: (amount: bigint) => Promise<void>;
}) {
  const shield = useShield({ address: tokenAddress });
  const [amount, setAmount] = useState("");
  const [isApproving, setIsApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  async function handleShield() {
    const parsed = parseAmountSafe(amount, decimals);
    if (!parsed) return;
    setApproveError(null);
    setIsApproving(true);
    try {
      await preApprove(parsed);
    } catch (error: unknown) {
      setApproveError(error instanceof Error ? error.message : "Approval failed");
      return;
    } finally {
      setIsApproving(false);
    }

    shield.mutate(
      { amount: parsed, approvalStrategy: "skip" },
      {
        onSuccess: () => {
          setAmount("");
          onSuccess();
        },
      },
    );
  }

  const isPending = isApproving || shield.isPending;
  const buttonLabel = isApproving ? "Approving…" : shield.isPending ? "Shielding…" : "Shield";

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
        disabled={isPending || !parseAmountSafe(amount, decimals)}
        className="btn btn-primary w-full"
      >
        {buttonLabel}
      </button>
      {approveError && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400 break-all">{approveError}</p>
      )}
      <MutationStatus mutation={shield} />
    </div>
  );
}
