import { ShieldForm } from "@zama-fhe/test-components";
import { getAddress } from "viem";
import { CONTRACTS } from "@/constants";

export default async function ShieldPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = getAddress(params.token ?? CONTRACTS.USDT);
  const wrapper = getAddress(params.wrapper ?? CONTRACTS.cUSDT);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Shield Tokens</h1>
      <ShieldForm tokenAddress={token} wrapperAddress={wrapper} />
    </div>
  );
}
