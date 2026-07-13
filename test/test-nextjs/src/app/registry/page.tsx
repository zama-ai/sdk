import { CONTRACTS } from "@/constants";
import { RegistryPanel } from "@zama-fhe/test-components";
import { getAddress } from "viem";

export default async function RegistryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = getAddress(params.token ?? CONTRACTS.USDT);
  const confidentialToken = getAddress(params.confidentialToken ?? CONTRACTS.cUSDT);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Wrappers Registry</h1>
      <RegistryPanel tokenAddress={token} confidentialTokenAddress={confidentialToken} />
    </div>
  );
}
