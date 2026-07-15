import { CONTRACTS } from "@/constants";
import { TransferAndCallForm, TransferFromAndCallForm } from "@zama-fhe/test-components";
import { getAddress } from "viem";

export default async function TransferAndCallPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = getAddress(params.token ?? CONTRACTS.cUSDT);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Confidential Transfer &amp; Call</h1>
      <TransferAndCallForm tokenAddress={token} />
      <TransferFromAndCallForm tokenAddress={token} />
    </div>
  );
}
