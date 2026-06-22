import { TransferForm } from "@zama-fhe/test-components";
import type { Address } from "@zama-fhe/sdk";
import { CONTRACTS } from "@/constants";

export default async function TransferPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = (params.token as Address) ?? CONTRACTS.cUSDT;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Confidential Transfer</h1>
      <TransferForm tokenAddress={token} />
    </div>
  );
}
