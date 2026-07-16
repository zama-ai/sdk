import { CONFIDENTIAL_TOKEN_ADDRESSES } from "@/constants";
import { AllowAllPanel } from "@zama-fhe/test-components";
import { getAddress } from "viem";

export default async function AllowAllPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tokensParam = params.tokens;
  const tokens = tokensParam
    ? tokensParam.split(",").map(getAddress)
    : CONFIDENTIAL_TOKEN_ADDRESSES;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Allow All</h1>
      <AllowAllPanel tokenAddresses={tokens} />
    </div>
  );
}
