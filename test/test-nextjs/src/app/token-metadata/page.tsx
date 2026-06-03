import { TokenMetadataPanel } from "@zama-fhe/test-components";
import type { Address } from "@zama-fhe/sdk";
import { CONTRACTS } from "@/constants";

export default async function TokenMetadataPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = (params.token as Address) ?? CONTRACTS.cUSDT;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Token Metadata</h1>
      <TokenMetadataPanel tokenAddress={token} />
    </div>
  );
}
