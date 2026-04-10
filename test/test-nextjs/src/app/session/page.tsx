import { SessionPanel } from "@zama-fhe/test-components";
import type { Address } from "@zama-fhe/react-sdk";
import { CONFIDENTIAL_TOKEN_ADDRESSES } from "@/constants";

export default async function SessionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tokens = params.tokens
    ? (params.tokens.split(",") as [Address, ...Address[]])
    : CONFIDENTIAL_TOKEN_ADDRESSES;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Session Management</h1>
      <SessionPanel tokenAddresses={tokens} />
    </div>
  );
}
