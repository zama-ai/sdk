import { CONTRACTS } from "@/constants";
import { TokenMetadataPanel } from "@zama-fhe/test-components";
import { getAddress } from "viem";

export default async function TokenMetadataPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = getAddress(params.token ?? CONTRACTS.cUSDT);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Token Metadata</h1>
      <TokenMetadataPanel tokenAddress={token} />
    </div>
  );
}
