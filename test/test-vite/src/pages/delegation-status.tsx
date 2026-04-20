import type { Address } from "@zama-fhe/sdk";
import { useSearchParams } from "react-router";
import { DelegationStatusPanel } from "@zama-fhe/test-components";
import { CONFIDENTIAL_TOKEN_ADDRESSES } from "../constants";

export default function DelegationStatusPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") as Address) ?? CONFIDENTIAL_TOKEN_ADDRESSES[0];
  const delegator = searchParams.get("delegator") as Address | undefined;
  const delegate = searchParams.get("delegate") as Address | undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Delegation Status</h1>
      <DelegationStatusPanel
        tokenAddress={token}
        defaultDelegator={delegator ?? undefined}
        defaultDelegate={delegate ?? undefined}
      />
    </div>
  );
}
