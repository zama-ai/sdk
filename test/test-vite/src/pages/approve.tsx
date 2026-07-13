import { getAddress } from "viem";
import { useSearchParams } from "react-router";
import { ApproveForm } from "@zama-fhe/test-components";
import { DEFAULTS } from "../constants";

export default function ApprovePage() {
  const [searchParams] = useSearchParams();
  const token = getAddress(searchParams.get("token") ?? DEFAULTS.confidentialToken);
  const spenderParam = searchParams.get("spender");
  const spender = spenderParam ? getAddress(spenderParam) : undefined;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Approve Operator</h1>
      <ApproveForm tokenAddress={token} defaultSpender={spender} />
    </div>
  );
}
