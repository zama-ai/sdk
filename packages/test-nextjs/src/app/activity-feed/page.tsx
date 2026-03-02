import { ActivityFeedPanel } from "@zama-fhe/test-components";
import type { Address } from "@zama-fhe/react-sdk";
import { CONTRACTS } from "@/constants";

export default async function ActivityFeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = (params.token as Address) ?? CONTRACTS.cUSDT;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Activity Feed</h1>
      <ActivityFeedPanel tokenAddress={token} />
    </div>
  );
}
