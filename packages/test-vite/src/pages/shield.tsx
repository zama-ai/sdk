import type { Address } from "@zama-fhe/react-sdk";
import { useSearchParams } from "react-router";
import { ShieldForm } from "@zama-fhe/test-components";
import { CONTRACTS } from "../constants";

export default function ShieldPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") as Address) ?? CONTRACTS.USDT;
  const wrapper = (searchParams.get("wrapper") as Address) ?? CONTRACTS.wrapper;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Shield Tokens</h1>
      <ShieldForm tokenAddress={token} wrapperAddress={wrapper} />
    </div>
  );
}
