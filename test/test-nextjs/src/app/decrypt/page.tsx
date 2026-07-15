import { CONTRACTS } from "@/constants";
import { DecryptPanel } from "@zama-fhe/test-components";
import { getAddress } from "viem";

export default async function DecryptPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = getAddress(params.token ?? CONTRACTS.cUSDT);
  const secondToken = getAddress(params.secondToken ?? CONTRACTS.cUSDC);
  const delegator = getAddress(params.delegator ?? CONTRACTS.cUSDT);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Decrypt Variants</h1>
      <DecryptPanel
        tokenAddress={token}
        secondTokenAddress={secondToken}
        delegatorAddress={delegator}
      />
    </div>
  );
}
