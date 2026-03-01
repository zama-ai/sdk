import { BatchTransferForm } from "@zama-fhe/test-components";
import type { Address } from "@zama-fhe/react-sdk";

const DEFAULTS = {
  token: "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762" as Address, // cUSDT
  batcher: "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82" as Address,
  feeManager: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
};

export default async function BatchTransferPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = (params.token as Address) ?? DEFAULTS.token;
  const batcher = (params.batcher as Address) ?? DEFAULTS.batcher;
  const feeManager = (params.feeManager as Address) ?? DEFAULTS.feeManager;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Batch Transfer</h1>
      <BatchTransferForm
        tokenAddress={token}
        batcherAddress={batcher}
        feeManagerAddress={feeManager}
      />
    </div>
  );
}
