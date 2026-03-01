"use client";

import {
  useEncrypt,
  useConfidentialBalance,
  useTokenMetadata,
  useBatchTransferFee,
  type Address,
  type BatchTransferData,
} from "@zama-fhe/react-sdk";
import { useConfidentialBatchTransfer } from "@zama-fhe/react-sdk/wagmi";
import { useAccount } from "wagmi";
import { bytesToHex } from "viem";

export function BatchTransferForm({
  tokenAddress,
  batcherAddress,
  feeManagerAddress,
}: {
  tokenAddress: Address;
  batcherAddress: Address;
  feeManagerAddress: Address;
}) {
  const { address: userAddress } = useAccount();
  const { data: metadata } = useTokenMetadata(tokenAddress);
  const { data: balance } = useConfidentialBalance({ tokenAddress });
  const { data: batchFee } = useBatchTransferFee(feeManagerAddress);
  const encrypt = useEncrypt();
  const batchTransfer = useConfidentialBatchTransfer();

  return (
    <form
      action={async (formData) => {
        if (!userAddress || batchFee === undefined) return;

        const recipient1 = formData.get("recipient1") as Address;
        const amount1 = BigInt(formData.get("amount1") as string);
        const recipient2 = formData.get("recipient2") as Address;
        const amount2 = BigInt(formData.get("amount2") as string);

        const encrypted = await encrypt.mutateAsync({
          values: [amount1, amount2],
          contractAddress: tokenAddress,
          userAddress,
        });

        const transfers: BatchTransferData[] = [
          {
            to: recipient1,
            encryptedAmount: bytesToHex(encrypted.handles[0]!) as Address,
            inputProof: bytesToHex(encrypted.inputProof) as Address,
            retryFor: 0n,
          },
          {
            to: recipient2,
            encryptedAmount: bytesToHex(encrypted.handles[1]!) as Address,
            inputProof: bytesToHex(encrypted.inputProof) as Address,
            retryFor: 0n,
          },
        ];

        batchTransfer.mutate(batcherAddress, tokenAddress, userAddress, transfers, batchFee);
      }}
      className="space-y-4"
      data-testid="batch-transfer-form"
    >
      <h2 className="text-xl font-semibold">Batch Transfer {metadata?.symbol ?? "..."}</h2>

      {balance !== undefined && (
        <p className="text-sm text-gray-600" data-testid="current-balance">
          Balance: {balance.toString()}
        </p>
      )}

      {batchFee !== undefined && (
        <p className="text-sm text-gray-600" data-testid="batch-fee">
          Batch fee: {batchFee.toString()}
        </p>
      )}

      <div className="space-y-2">
        <h3 className="font-medium">Transfer 1</h3>
        <input
          type="text"
          name="recipient1"
          placeholder="Recipient 1 (0x...)"
          required
          className="w-full px-3 py-2 border rounded"
          data-testid="recipient1-input"
        />
        <input
          type="text"
          name="amount1"
          placeholder="Amount 1"
          required
          className="w-full px-3 py-2 border rounded"
          data-testid="amount1-input"
        />
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">Transfer 2</h3>
        <input
          type="text"
          name="recipient2"
          placeholder="Recipient 2 (0x...)"
          required
          className="w-full px-3 py-2 border rounded"
          data-testid="recipient2-input"
        />
        <input
          type="text"
          name="amount2"
          placeholder="Amount 2"
          required
          className="w-full px-3 py-2 border rounded"
          data-testid="amount2-input"
        />
      </div>

      <button
        type="submit"
        disabled={encrypt.isPending || batchTransfer.isPending}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        data-testid="batch-transfer-button"
      >
        {encrypt.isPending
          ? "Encrypting..."
          : batchTransfer.isPending
            ? "Transferring..."
            : "Batch Transfer"}
      </button>

      {batchTransfer.isSuccess && (
        <p className="text-green-600" data-testid="batch-transfer-success">
          Batch transfer successful! Tx: {batchTransfer.data}
        </p>
      )}

      {batchTransfer.isError && (
        <p className="text-red-600" data-testid="batch-transfer-error">
          Error: {batchTransfer.error.message}
        </p>
      )}
    </form>
  );
}
