import { CONTRACTS } from "@/constants";
import { TransferFromForm } from "@zama-fhe/test-components";
import { getAddress } from "viem";

export default async function TransferFromPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = getAddress(params.token ?? CONTRACTS.cUSDT);
  const from = params.from ? getAddress(params.from) : undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Transfer From (Operator)</h1>
      <TransferFromForm tokenAddress={token} defaultFrom={from} />
    </div>
  );
}
