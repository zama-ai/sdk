import { useConfidentialTransfer } from "@zama-fhe/react-sdk";
import { getAddress, isAddress, type Address } from "viem";
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
  const transfer = useConfidentialTransfer({ address: tokenAddress });
  function handleTransfer(formData: FormData) {
    const parsed = parseAmountSafe(formData.get("amount") as string, decimals);
    const to = formData.get("recipient") as string;
    if (!parsed || !isAddress(to)) {
      transfer.reset();
      return;
    }
    transfer.mutate({ to: getAddress(to), amount: parsed });
  }

  return (
    <section className="card" aria-labelledby="turnkey-transfer-title">
      <h2 className="card-title" id="turnkey-transfer-title">
        Confidential Transfer
      </h2>
      <form action={handleTransfer}>
        <label className="sr-only" htmlFor="turnkey-transfer-amount">
          Amount
        </label>
        <div className="flex items-center gap-2 mb-2">
          <input
            id="turnkey-transfer-amount"
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
        <label className="sr-only" htmlFor="turnkey-transfer-recipient">
          Recipient address
        </label>
        <input
          id="turnkey-transfer-recipient"
          name="recipient"
          className="input w-full mb-3"
          type="text"
          pattern="0x[a-fA-F0-9]{40}"
          title="0x followed by 40 hexadecimal characters."
          placeholder="Recipient address (0x…)"
          required
        />
        <button type="submit" disabled={transfer.isPending} className="btn btn-primary w-full">
          {transfer.isPending ? "Sending…" : "Transfer"}
        </button>
      </form>
      <MutationStatus mutation={transfer} />
    </section>
  );
}
