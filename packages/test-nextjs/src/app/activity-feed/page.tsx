import { ActivityFeedPanel } from "@zama-fhe/test-components";
import type { Address } from "@zama-fhe/react-sdk";

const DEFAULT_TOKEN = "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762" as Address; // cUSDT

export default async function ActivityFeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = (params.token as Address) ?? DEFAULT_TOKEN;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Activity Feed</h1>
      <ActivityFeedPanel tokenAddress={token} />
    </div>
  );
}
