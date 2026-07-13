import { ResumeUnshieldForm } from "@zama-fhe/test-components";
import { useSearchParams } from "react-router";
import { getAddress } from "viem";
import { DEFAULTS } from "../constants";

export default function ResumeUnshieldPage() {
  const [searchParams] = useSearchParams();
  const token = getAddress(searchParams.get("token") ?? DEFAULTS.confidentialToken);
  const wrapper = getAddress(searchParams.get("wrapper") ?? token);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Resume Unshield</h1>
      <ResumeUnshieldForm tokenAddress={token} wrapperAddress={wrapper} />
    </div>
  );
}
