import { WrapperDiscoveryPanel } from "@zama-fhe/test-components";
import { getAddress } from "viem";

export default async function WrapperDiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tokenAddress = params.tokenAddress ? getAddress(params.tokenAddress) : undefined;
  const erc20Address = params.erc20Address ? getAddress(params.erc20Address) : undefined;

  if (!tokenAddress) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Wrapper Discovery</h1>
        <p>Missing ?tokenAddress= query param</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Wrapper Discovery</h1>
      <WrapperDiscoveryPanel tokenAddress={tokenAddress} erc20Address={erc20Address} />
    </div>
  );
}
