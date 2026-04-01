import type { Address } from "@zama-fhe/react-sdk";
import { useSearchParams } from "react-router";
import { BatchTransferForm } from "@zama-fhe/test-components";
import { DEFAULTS, TRANSFER_BATCHER_ADDRESS } from "../constants";

export default function BatchTransferPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") as Address) ?? DEFAULTS.confidentialToken;
  const batcher = (searchParams.get("batcher") as Address) ?? TRANSFER_BATCHER_ADDRESS;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Batch Transfer</h1>
      <BatchTransferForm tokenAddress={token} batcherAddress={batcher} />
    </div>
  );
}
