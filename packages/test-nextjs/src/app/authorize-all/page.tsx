import { AuthorizeAllPanel } from "@zama-fhe/test-components";
import type { Address } from "@zama-fhe/react-sdk";
import { CONFIDENTIAL_TOKEN_ADDRESSES } from "@/constants";

export default async function AuthorizeAllPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tokensParam = params.tokens;
  const tokens = tokensParam ? (tokensParam.split(",") as Address[]) : CONFIDENTIAL_TOKEN_ADDRESSES;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Authorize All</h1>
      <AuthorizeAllPanel tokenAddresses={tokens} />
    </div>
  );
}
