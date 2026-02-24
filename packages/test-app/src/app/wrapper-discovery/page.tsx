import { WrapperDiscoveryPanel } from "@/components/wrapper-discovery-panel";
import type { Address } from "@zama-fhe/react-sdk";

export default async function WrapperDiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = params.token as Address | undefined;
  const coordinator = params.coordinator as Address | undefined;

  if (!token) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Wrapper Discovery</h1>
        <p>Missing ?token= query param</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Wrapper Discovery</h1>
      <WrapperDiscoveryPanel tokenAddress={token} coordinatorAddress={coordinator} />
    </div>
  );
}
