import { TokenMetadataPanel } from "@zama-fhe/test-components";
import { useSearchParams } from "react-router";
import { getAddress } from "viem";
import { DEFAULTS } from "../constants";

export default function TokenMetadataPage() {
  const [searchParams] = useSearchParams();
  const token = getAddress(searchParams.get("token") ?? DEFAULTS.confidentialToken);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Token Metadata</h1>
      <TokenMetadataPanel tokenAddress={token} />
    </div>
  );
}
