import type { Address } from "@zama-fhe/react-sdk";
import { useSearchParams } from "react-router";
import { UnwrapManualForm } from "@zama-fhe/test-components";
import { DEFAULTS } from "../constants";

export function UnwrapManualPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") as Address) ?? DEFAULTS.confidentialToken;
  const wrapper = (searchParams.get("wrapper") as Address | undefined) ?? undefined;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Manual Unwrap (Two-Step)</h1>
      <UnwrapManualForm tokenAddress={token} wrapperAddress={wrapper} />
    </div>
  );
}
