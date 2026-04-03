import type { Address } from "@zama-fhe/react-sdk";
import { useSearchParams } from "react-router";
import { TokenMetadataPanel } from "@zama-fhe/test-components";
import { DEFAULTS } from "../constants";

export default function TokenMetadataPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") as Address) ?? DEFAULTS.confidentialToken;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Token Metadata</h1>
      <TokenMetadataPanel tokenAddress={token} />
    </div>
  );
}
