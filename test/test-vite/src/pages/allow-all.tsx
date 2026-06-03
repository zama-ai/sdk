import type { Address } from "@zama-fhe/sdk";
import { useSearchParams } from "react-router";
import { AllowAllPanel } from "@zama-fhe/test-components";
import { CONFIDENTIAL_TOKEN_ADDRESSES } from "../constants";

export default function AllowAllPage() {
  const [searchParams] = useSearchParams();
  const tokensParam = searchParams.get("tokens");
  const tokens = tokensParam ? (tokensParam.split(",") as Address[]) : CONFIDENTIAL_TOKEN_ADDRESSES;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Allow All</h1>
      <AllowAllPanel tokenAddresses={tokens} />
    </div>
  );
}
