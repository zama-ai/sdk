import { ShieldForm } from "@zama-fhe/test-components";
import { useSearchParams } from "react-router";
import { getAddress } from "viem";
import { DEFAULTS } from "../constants";

export default function ShieldPage() {
  const [searchParams] = useSearchParams();
  const token = getAddress(searchParams.get("token") ?? DEFAULTS.token);
  const wrapper = getAddress(searchParams.get("wrapper") ?? DEFAULTS.wrapper);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Shield Tokens</h1>
      <ShieldForm tokenAddress={token} wrapperAddress={wrapper} />
    </div>
  );
}
