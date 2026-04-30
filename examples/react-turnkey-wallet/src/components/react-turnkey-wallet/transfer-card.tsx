import { useState } from "react";
import { useConfidentialTransfer } from "@zama-fhe/react-sdk";
import { isAddress, type Address } from "viem";
import { parseAmountSafe } from "@/lib/react-turnkey-wallet/utils";
import { MutationStatus } from "./mutation-status";

export function TransferCard({
  tokenAddress,
  decimals,
  symbol,
}: {
  tokenAddress: Address;
  decimals: number;
  symbol: string;
}) {
  const transfer = useConfidentialTransfer({ tokenAddress });
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  const addressInvalid = to.length > 0 && !isAddress(to);

  function handleTransfer() {
    const parsed = parseAmountSafe(amount, decimals);
    if (!parsed || !isAddress(to)) return;
    transfer.mutate(
      { to: to as Address, amount: parsed },
      {
        onSuccess: () => {
          setTo("");
          setAmount("");
        },
      },
    );
  }

  return (
    <div className="card">
      <div className="card-title">Confidential Transfer</div>
      <div className="flex items-center gap-2 mb-2">
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
      <input
        className={`input w-full ${addressInvalid ? "border-red-400 focus:border-red-500 focus:ring-red-500 mb-1" : "mb-3"}`}
        type="text"
        placeholder="Recipient address (0x…)"
        value={to}
        onChange={(event) => setTo(event.target.value)}
      />
      {addressInvalid && <p className="text-xs text-red-500 mb-3">Invalid Ethereum address</p>}
      <button
        onClick={handleTransfer}
        disabled={transfer.isPending || !parseAmountSafe(amount, decimals) || !isAddress(to)}
        className="btn btn-primary w-full"
      >
        {transfer.isPending ? "Sending…" : "Transfer"}
      </button>
      <MutationStatus mutation={transfer} />
    </div>
  );
}
