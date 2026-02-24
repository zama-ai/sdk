import { FheRelayerPanel } from "@/components/fhe-relayer-panel";
import type { Address } from "@zama-fhe/react-sdk";

const DEFAULT_TOKEN = "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762" as Address; // cUSDT

export default async function FheRelayerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const tokensParam = params.tokens;
  const tokens = tokensParam ? (tokensParam.split(",") as Address[]) : [DEFAULT_TOKEN];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">FHE Relayer</h1>
      <FheRelayerPanel tokenAddresses={tokens} />
    </div>
  );
}
