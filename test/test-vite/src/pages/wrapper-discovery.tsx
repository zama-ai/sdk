import type { Address } from "@zama-fhe/react-sdk";
import { useSearchParams } from "react-router";
import { WrapperDiscoveryPanel } from "@zama-fhe/test-components";

export default function WrapperDiscoveryPage() {
  const [searchParams] = useSearchParams();
  const tokenAddress = (searchParams.get("tokenAddress") as Address | undefined) ?? undefined;
  const erc20Address = (searchParams.get("erc20Address") as Address | undefined) ?? undefined;
  const wrappersRegistryOverride =
    (searchParams.get("wrappersRegistryAddress") as Address | undefined) ?? undefined;
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
