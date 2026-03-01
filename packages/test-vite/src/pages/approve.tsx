import type { Address } from "@zama-fhe/react-sdk";
import { useSearchParams } from "react-router";
import { ApproveForm } from "@zama-fhe/test-components";
import { DEFAULTS } from "../constants";

export function ApprovePage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") as Address) ?? DEFAULTS.confidentialToken;
  const spender = (searchParams.get("spender") as Address | undefined) ?? undefined;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Approve Operator</h1>
      <ApproveForm tokenAddress={token} defaultSpender={spender} />
    </div>
  );
}
