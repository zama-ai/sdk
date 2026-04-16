import { DelegationStatusPanel } from "@zama-fhe/test-components";
import type { Address } from "@zama-fhe/sdk";
import { CONFIDENTIAL_TOKEN_ADDRESSES } from "@/constants";

export default async function DelegationStatusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = (params.token as Address) ?? CONFIDENTIAL_TOKEN_ADDRESSES[0];
  const delegator = params.delegator as Address | undefined;
  const delegate = params.delegate as Address | undefined;

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
