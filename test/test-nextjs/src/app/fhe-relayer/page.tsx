import { FheRelayerPanel } from "@zama-fhe/test-components";
import type { Address } from "@zama-fhe/sdk";
import { CONTRACTS } from "@/constants";

export default async function FheRelayerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tokensParam = params.tokens;
  const tokens = tokensParam ? (tokensParam.split(",") as Address[]) : [CONTRACTS.cUSDT];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">FHE Relayer</h1>
      <FheRelayerPanel tokenAddresses={tokens} />
    </div>
  );
}
