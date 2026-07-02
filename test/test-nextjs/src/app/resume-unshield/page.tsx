import { CONTRACTS } from "@/constants";
import { ResumeUnshieldForm } from "@zama-fhe/test-components";
import { getAddress } from "viem";

export default async function ResumeUnshieldPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = getAddress(params.token ?? CONTRACTS.cUSDT);
  const wrapper = getAddress(params.wrapper ?? token);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Resume Unshield</h1>
      <ResumeUnshieldForm tokenAddress={token} wrapperAddress={wrapper} />
    </div>
  );
}
