import { CONTRACTS } from "@/constants";
import { SuspensePanel } from "@zama-fhe/test-components";
import { getAddress } from "viem";

export default async function SuspensePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = getAddress(params.token ?? CONTRACTS.cUSDT);
  const erc20 = getAddress(params.erc20 ?? CONTRACTS.USDT);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Suspense Queries</h1>
      <SuspensePanel tokenAddress={token} erc20Address={erc20} />
    </div>
  );
}
