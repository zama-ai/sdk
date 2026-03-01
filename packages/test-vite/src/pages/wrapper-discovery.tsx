import type { Address } from "@zama-fhe/react-sdk";
import { useSearchParams } from "react-router";
import { WrapperDiscoveryPanel } from "@zama-fhe/test-components";

export function WrapperDiscoveryPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") as Address | undefined) ?? undefined;
  const coordinator = (searchParams.get("coordinator") as Address | undefined) ?? undefined;
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
