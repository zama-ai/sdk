"use client";

import {
  useConfidentialBalance,
  useConfidentialTransferAndCall,
  useMetadata,
} from "@zama-fhe/react-sdk";
import type { Address, Hex } from "@zama-fhe/sdk";
import { getAddress } from "viem";
import { useAccount } from "wagmi";

export function TransferAndCallForm({ tokenAddress }: { tokenAddress: Address }) {
  const { address } = useAccount();
  const { data: metadata } = useMetadata(tokenAddress);
  const { data: balance } = useConfidentialBalance({ address: tokenAddress, account: address });
  const transferAndCall = useConfidentialTransferAndCall({ address: tokenAddress });

  return (
    <form
      action={(formData) => {
        transferAndCall.mutate({
          to: getAddress(formData.get("recipient") as string),
          amount: BigInt(formData.get("amount") as string),
          data: formData.get("data") as Hex,
          // Test-harness convention (matches transfer-form / unshield-form): skip the SDK's
          // decrypt-and-compare so the E2E flow drives only the on-chain tx. Real integrators
          // should leave this at its `false` default — the balance check raises a clean
          // InsufficientConfidentialBalanceError before spending gas on a doomed transfer.
          skipBalanceCheck: true,
        });
      }}
      className="space-y-4"
      data-testid="transfer-and-call-form"
    >
      <h2 className="text-xl font-semibold text-white">
        Transfer & Call {metadata?.symbol ?? "..."}
      </h2>

      {balance !== undefined && (
        <p className="text-sm text-zama-gray" data-testid="current-balance">
          Balance: {balance.toString()}
        </p>
      )}

      <input
        type="text"
        name="recipient"
        placeholder="Recipient contract address (0x...)"
        aria-label="Recipient address"
        required
        className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
        data-testid="recipient-input"
      />

      <input
        type="text"
        name="amount"
        placeholder="Amount"
        aria-label="Amount"
        required
        className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
        data-testid="amount-input"
      />

      <input
        type="text"
        name="data"
        placeholder="Receiver hook data (0x...)"
        aria-label="Receiver hook data"
        required
        className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
        data-testid="data-input"
      />

      <button
        type="submit"
        disabled={transferAndCall.isPending}
        className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
        data-testid="transfer-and-call-button"
      >
        {transferAndCall.isPending ? "Transferring..." : "Transfer & Call"}
      </button>

      {transferAndCall.isSuccess && (
        <p className="text-zama-success" data-testid="transfer-and-call-success">
          Transfer successful! Tx: {transferAndCall.data?.txHash}
        </p>
      )}

      {transferAndCall.isError && (
        <p className="text-zama-error" data-testid="transfer-and-call-error">
          Error: {transferAndCall.error.message}
        </p>
      )}
    </form>
  );
}
