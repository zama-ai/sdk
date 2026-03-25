import { DelegationPanel } from "@zama-fhe/test-components";
import type { Address } from "@zama-fhe/react-sdk";
import { CONFIDENTIAL_TOKEN_ADDRESSES } from "@/constants";

export default async function DelegationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = (params.token as Address) ?? CONFIDENTIAL_TOKEN_ADDRESSES[0];
  const delegate = params.delegate as Address | undefined;
  const delegator = params.delegator as Address | undefined;

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
