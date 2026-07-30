import { SuspensePanel } from "@zama-fhe/test-components";
import { useSearchParams } from "react-router";
import { getAddress } from "viem";
import { DEFAULTS } from "../constants";

export default function SuspensePage() {
  const [searchParams] = useSearchParams();
  const token = getAddress(searchParams.get("token") ?? DEFAULTS.confidentialToken);
  const erc20 = getAddress(searchParams.get("erc20") ?? DEFAULTS.token);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Suspense Queries</h1>
      <SuspensePanel tokenAddress={token} erc20Address={erc20} />
    </div>
  );
}
