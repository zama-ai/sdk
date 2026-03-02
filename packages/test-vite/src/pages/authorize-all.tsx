import type { Address } from "@zama-fhe/react-sdk";
import { useSearchParams } from "react-router";
import { AuthorizeAllPanel } from "@zama-fhe/test-components";
import { CONFIDENTIAL_TOKEN_ADDRESSES } from "../constants";

export default function AuthorizeAllPage() {
  const [searchParams] = useSearchParams();
  const tokensParam = searchParams.get("tokens");
  const tokens = tokensParam ? (tokensParam.split(",") as Address[]) : CONFIDENTIAL_TOKEN_ADDRESSES;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Authorize All</h1>
      <AuthorizeAllPanel tokenAddresses={tokens} />
    </div>
  );
}
