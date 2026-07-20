import { useState } from "react";
import { useUnshield, useResumeUnshield } from "@zama-fhe/react-sdk";
import type { Address, Hex } from "viem";
import { parseAmountSafe, shortAddr, txLink } from "@/lib/react-turnkey-wallet/utils";
import { MutationStatus } from "./mutation-status";

export function UnshieldCard({
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
  const unshield = useUnshield(tokenAddress);
  const [phase, setPhase] = useState<1 | 2>(1);

  function handleUnshield(formData: FormData) {
    const parsed = parseAmountSafe(formData.get("amount") as string, decimals);
    if (!parsed) return;
    setPhase(1);
    unshield.mutate(
      { amount: parsed, onFinalizing: () => setPhase(2) },
      {
        onSuccess: () => {
          setPhase(1);
          onSuccess();
        },
      },
    );
  }

  return (
    <section className="card" aria-labelledby="turnkey-unshield-title">
      <h2 className="card-title" id="turnkey-unshield-title">
        Unshield — Confidential → ERC-20
      </h2>
      <form action={handleUnshield}>
        <p className="text-xs text-zinc-500 mb-3">
          Two-phase operation: unwrap then FHE-decrypt + finalize. If interrupted between phases,
          use Resume Unshield.
        </p>
        <label className="sr-only" htmlFor="turnkey-unshield-amount">
          Amount to unshield
        </label>
        <div className="flex items-center gap-2 mb-3">
          <input
            id="turnkey-unshield-amount"
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
        <button type="submit" disabled={unshield.isPending} className="btn btn-primary w-full">
          {unshield.isPending
            ? phase === 1
              ? "Unshielding… (1/2 unwrap)"
              : "Unshielding… (2/2 finalize)"
            : "Unshield"}
        </button>
      </form>
      <MutationStatus mutation={unshield} />
    </section>
  );
}

export function ResumeUnshieldCard({
  tokenAddress,
  txHash,
  onSuccess,
}: {
  tokenAddress: Address;
  txHash: Hex;
  onSuccess: () => void;
}) {
  const resumeUnshield = useResumeUnshield(tokenAddress);

  return (
    <section
      className="card border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950"
      aria-labelledby="turnkey-resume-unshield-title"
    >
      <h2
        className="card-title text-amber-700 dark:text-amber-300"
        id="turnkey-resume-unshield-title"
      >
        Pending Unshield — Resume Required
      </h2>
      <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
        Phase 1 completed but phase 2 (finalize) was interrupted.
      </p>
      <p className="font-mono text-xs text-zinc-500 break-all mb-3">
        Unwrap tx:{" "}
        <a href={txLink(txHash)} target="_blank" rel="noopener noreferrer" className="underline">
          {shortAddr(txHash)}
        </a>
      </p>
      <form action={() => resumeUnshield.mutate({ unwrapTxHash: txHash }, { onSuccess })}>
        <button
          type="submit"
          disabled={resumeUnshield.isPending}
          className="btn btn-primary w-full"
        >
          {resumeUnshield.isPending ? "Resuming…" : "Resume Unshield (Phase 2)"}
        </button>
      </form>
      <MutationStatus mutation={resumeUnshield} />
    </section>
  );
}
