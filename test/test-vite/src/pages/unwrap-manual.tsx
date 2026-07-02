import { getAddress } from "viem";
import { useSearchParams } from "react-router";
import { UnwrapManualForm } from "@zama-fhe/test-components";
import { DEFAULTS } from "../constants";

export default function UnwrapManualPage() {
  const [searchParams] = useSearchParams();
  const token = getAddress(searchParams.get("token") ?? DEFAULTS.confidentialToken);
  const wrapper = getAddress(searchParams.get("wrapper") ?? token);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Manual Unwrap (Two-Step)</h1>
      <UnwrapManualForm tokenAddress={token} wrapperAddress={wrapper} />
    </div>
  );
}
