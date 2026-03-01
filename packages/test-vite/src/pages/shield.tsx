import type { Address } from "@zama-fhe/react-sdk";
import { useSearchParams } from "react-router";
import { ShieldForm } from "../components/shield-form";
import { DEFAULTS } from "../constants";

export function ShieldPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") as Address) ?? DEFAULTS.token;
  const wrapper = (searchParams.get("wrapper") as Address) ?? DEFAULTS.wrapper;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Shield Tokens</h1>
      <ShieldForm tokenAddress={token} wrapperAddress={wrapper} />
    </div>
  );
}
