import { CONTRACTS } from "@/constants";
import { TransferForm } from "@zama-fhe/test-components";
import { getAddress } from "viem";

export default async function TransferPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = getAddress(params.token ?? CONTRACTS.cUSDT);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Confidential Transfer</h1>
      <TransferForm tokenAddress={token} />
    </div>
  );
}
