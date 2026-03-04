import type { Address } from "@zama-fhe/react-sdk";
import { useSearchParams } from "react-router";
import { FheRelayerPanel } from "@zama-fhe/test-components";
import { CONTRACTS } from "../constants";

export default function FheRelayerPage() {
  const [searchParams] = useSearchParams();
  const tokensParam = searchParams.get("tokens");
  const tokens = tokensParam ? (tokensParam.split(",") as Address[]) : [CONTRACTS.cUSDT];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">FHE Relayer</h1>
      <FheRelayerPanel tokenAddresses={tokens} />
    </div>
  );
}
