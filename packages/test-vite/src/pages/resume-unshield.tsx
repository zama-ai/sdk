import type { Address } from "@zama-fhe/react-sdk";
import { useSearchParams } from "react-router";
import { ResumeUnshieldForm } from "@zama-fhe/test-components";
import { CONTRACTS } from "../constants";

export default function ResumeUnshieldPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") as Address) ?? CONTRACTS.cUSDT;
  const wrapper = (searchParams.get("wrapper") as Address | undefined) ?? undefined;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Resume Unshield</h1>
      <ResumeUnshieldForm tokenAddress={token} wrapperAddress={wrapper} />
    </div>
  );
}
