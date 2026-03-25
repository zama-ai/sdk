import { WrapperDiscoveryPanel } from "@zama-fhe/test-components";
import type { Address } from "@zama-fhe/react-sdk";

export default async function WrapperDiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tokenAddress = params.tokenAddress as Address | undefined;
  const erc20Address = params.erc20Address as Address | undefined;
  const wrappersRegistryOverride = params.wrappersRegistryAddress as Address | undefined;
  // Hardhat chain ID 31337 — only relevant for local test environments
  const wrappersRegistryAddresses = wrappersRegistryOverride
    ? { [31337]: wrappersRegistryOverride }
    : undefined;

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
      <WrapperDiscoveryPanel
        tokenAddress={tokenAddress}
        erc20Address={erc20Address}
        wrappersRegistryAddresses={wrappersRegistryAddresses}
      />
    </div>
  );
}
