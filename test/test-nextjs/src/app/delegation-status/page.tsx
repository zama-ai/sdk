import { CONFIDENTIAL_TOKEN_ADDRESSES } from "@/constants";
import { DelegationStatusPanel } from "@zama-fhe/test-components";
import { getAddress } from "viem";

export default async function DelegationStatusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = getAddress(params.token ?? CONFIDENTIAL_TOKEN_ADDRESSES[0]);
  const delegator = params.delegator ? getAddress(params.delegator) : undefined;
  const delegate = params.delegate ? getAddress(params.delegate) : undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Delegation Status</h1>
      <DelegationStatusPanel
        tokenAddress={token}
        defaultDelegator={delegator}
        defaultDelegate={delegate}
      />
    </div>
  );
}
