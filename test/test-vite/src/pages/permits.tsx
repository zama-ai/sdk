import type { Address } from "@zama-fhe/sdk";
import { useSearchParams } from "react-router";
import { PermitsPanel } from "@zama-fhe/test-components";
import { CONFIDENTIAL_TOKEN_ADDRESSES } from "../constants";

export default function PermitsPage() {
  const [searchParams] = useSearchParams();
  const tokens = searchParams.get("tokens")
    ? (searchParams.get("tokens")!.split(",") as [Address, ...Address[]])
    : CONFIDENTIAL_TOKEN_ADDRESSES;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Permits</h1>
      <PermitsPanel tokenAddresses={tokens} />
    </div>
  );
}
