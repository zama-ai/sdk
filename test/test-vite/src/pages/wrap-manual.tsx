import type { Address } from "@zama-fhe/sdk";
import { useSearchParams } from "react-router";
import { WrapManualForm } from "@zama-fhe/test-components";
import { DEFAULTS } from "../constants";

export default function WrapManualPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") as Address) ?? DEFAULTS.token;
  const wrapper = (searchParams.get("wrapper") as Address) ?? DEFAULTS.wrapper;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Manual Wrap (Approve + Wrap)</h1>
      <WrapManualForm tokenAddress={token} wrapperAddress={wrapper} />
    </div>
  );
}
