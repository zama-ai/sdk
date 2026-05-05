import { PermitsPanel } from "@zama-fhe/test-components";
import type { Address } from "@zama-fhe/sdk";
import { CONFIDENTIAL_TOKEN_ADDRESSES } from "@/constants";

export default async function PermitsPage({
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
      <h1 className="text-2xl font-bold">Permits</h1>
      <PermitsPanel tokenAddresses={tokens} />
    </div>
  );
}
