import { CONFIDENTIAL_TOKEN_ADDRESSES } from "@/constants";
import { DelegationPanel } from "@zama-fhe/test-components";
import { getAddress } from "viem";

export default async function DelegationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = getAddress(params.token ?? CONFIDENTIAL_TOKEN_ADDRESSES[0]);
  const delegate = params.delegate ? getAddress(params.delegate) : undefined;
  const delegator = params.delegator ? getAddress(params.delegator) : undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Delegation</h1>
      <DelegationPanel
        tokenAddress={token}
        defaultDelegate={delegate}
        defaultDelegator={delegator}
      />
    </div>
  );
}
