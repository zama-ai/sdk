import { CONTRACTS } from "@/constants";
import { ApproveForm } from "@zama-fhe/test-components";
import { getAddress } from "viem";

export default async function ApprovePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = getAddress(params.token ?? CONTRACTS.cUSDT);
  const spender = params.spender ? getAddress(params.spender) : undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Approve Operator</h1>
      <ApproveForm tokenAddress={token} defaultSpender={spender} />
    </div>
  );
}
