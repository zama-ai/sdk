import type { Address } from "@zama-fhe/react-sdk";
import { useSearchParams } from "react-router";
import { DelegationPanel } from "@zama-fhe/test-components";
import { CONFIDENTIAL_TOKEN_ADDRESSES } from "../constants";

export default function DelegationPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") as Address) ?? CONFIDENTIAL_TOKEN_ADDRESSES[0];
  const delegate = searchParams.get("delegate") as Address | undefined;
  const delegator = searchParams.get("delegator") as Address | undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Delegation</h1>
      <DelegationPanel
        tokenAddress={token}
        defaultDelegate={delegate ?? undefined}
        defaultDelegator={delegator ?? undefined}
      />
    </div>
  );
}
