import { useEffect, useState } from "react";
import { useUnshield, useResumeUnshield } from "@zama-fhe/react-sdk";
import { savePendingUnshield, ZamaSDKEvents, indexedDBStorage } from "@zama-fhe/sdk";
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
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<1 | 2>(1);

  useEffect(() => {
    function handlePhase1(event: Event) {
      const txHash = (event as CustomEvent<{ txHash: Hex }>).detail.txHash;
      savePendingUnshield(indexedDBStorage, tokenAddress, txHash).catch(console.error);
    }

    window.addEventListener(ZamaSDKEvents.UnshieldPhase1Submitted, handlePhase1);
    return () => window.removeEventListener(ZamaSDKEvents.UnshieldPhase1Submitted, handlePhase1);
  }, [tokenAddress]);

  function handleUnshield() {
    const parsed = parseAmountSafe(amount, decimals);
    if (!parsed) return;
    setPhase(1);
    unshield.mutate(
      { amount: parsed, onFinalizing: () => setPhase(2) },
      {
        onSuccess: () => {
          setAmount("");
          setPhase(1);
          onSuccess();
        },
      },
    );
  }

  return (
    <div className="card">
      <div className="card-title">Unshield — Confidential → ERC-20</div>
      <p className="text-xs text-zinc-500 mb-3">
        Two-phase operation: unwrap then FHE-decrypt + finalize. If interrupted between phases, use
        Resume Unshield.
      </p>
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
        onClick={handleUnshield}
        disabled={unshield.isPending || !parseAmountSafe(amount, decimals)}
        className="btn btn-primary w-full"
      >
        {unshield.isPending
          ? phase === 1
            ? "Unshielding… (1/2 unwrap)"
            : "Unshielding… (2/2 finalize)"
          : "Unshield"}
      </button>
      <MutationStatus mutation={unshield} />
    </div>
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
    <div className="card border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950">
      <div className="card-title text-amber-700 dark:text-amber-300">
        Pending Unshield — Resume Required
      </div>
      <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
        Phase 1 completed but phase 2 (finalize) was interrupted.
      </p>
      <p className="font-mono text-xs text-zinc-500 break-all mb-3">
        Unwrap tx:{" "}
        <a href={txLink(txHash)} target="_blank" rel="noopener noreferrer" className="underline">
          {shortAddr(txHash)}
        </a>
      </p>
      <button
        onClick={() => resumeUnshield.mutate({ unwrapTxHash: txHash }, { onSuccess })}
        disabled={resumeUnshield.isPending}
        className="btn btn-primary w-full"
      >
        {resumeUnshield.isPending ? "Resuming…" : "Resume Unshield (Phase 2)"}
      </button>
      <MutationStatus mutation={resumeUnshield} />
    </div>
  );
}
