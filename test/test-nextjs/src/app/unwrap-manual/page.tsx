import { UnwrapManualForm } from "@zama-fhe/test-components";
import { getAddress } from "viem";
import { CONTRACTS } from "@/constants";

export default async function UnwrapManualPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = getAddress(params.token ?? CONTRACTS.cUSDT);
  const wrapper = getAddress(params.wrapper ?? token);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Manual Unwrap (Two-Step)</h1>
      <UnwrapManualForm tokenAddress={token} wrapperAddress={wrapper} />
    </div>
  );
}
