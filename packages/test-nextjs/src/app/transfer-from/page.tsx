import { TransferFromForm } from "@zama-fhe/test-components";
import type { Address } from "@zama-fhe/react-sdk";
import { CONTRACTS } from "@/constants";

export default async function TransferFromPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = (params.token as Address) ?? CONTRACTS.confidentialToken;
  const from = params.from as Address | undefined;
  const wrapper = params.wrapper as Address | undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Transfer From (Operator)</h1>
      <TransferFromForm tokenAddress={token} defaultFrom={from} wrapperAddress={wrapper} />
    </div>
  );
}
