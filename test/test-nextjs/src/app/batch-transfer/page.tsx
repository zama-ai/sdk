import { BatchTransferForm } from "@zama-fhe/test-components";
import type { Address } from "@zama-fhe/react-sdk";
import { CONTRACTS } from "@/constants";

export default async function BatchTransferPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = (params.token as Address) ?? CONTRACTS.cUSDT;
  const batcher = (params.batcher as Address) ?? CONTRACTS.transferBatcher;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Batch Transfer</h1>
      <BatchTransferForm tokenAddress={token} batcherAddress={batcher} />
    </div>
  );
}
