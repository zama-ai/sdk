import { ShieldForm } from "@zama-fhe/test-components";
import type { Address } from "@zama-fhe/react-sdk";
import { CONTRACTS } from "@/constants";

export default async function ShieldPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = (params.token as Address) ?? CONTRACTS.USDT;
  const wrapper = (params.wrapper as Address) ?? CONTRACTS.cUSDT;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Shield Tokens</h1>
      <ShieldForm tokenAddress={token} wrapperAddress={wrapper} />
    </div>
  );
}
