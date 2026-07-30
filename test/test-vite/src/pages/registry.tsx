import { RegistryPanel } from "@zama-fhe/test-components";
import { useSearchParams } from "react-router";
import { getAddress } from "viem";
import { DEFAULTS } from "../constants";

export default function RegistryPage() {
  const [searchParams] = useSearchParams();
  const token = getAddress(searchParams.get("token") ?? DEFAULTS.token);
  const confidentialToken = getAddress(
    searchParams.get("confidentialToken") ?? DEFAULTS.confidentialToken,
  );
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Wrappers Registry</h1>
      <RegistryPanel tokenAddress={token} confidentialTokenAddress={confidentialToken} />
    </div>
  );
}
