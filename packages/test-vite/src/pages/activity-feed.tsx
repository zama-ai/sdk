import type { Address } from "@zama-fhe/react-sdk";
import { useSearchParams } from "react-router";
import { ActivityFeedPanel } from "@zama-fhe/test-components";
import { DEFAULTS } from "../constants";

export default function ActivityFeedPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") as Address) ?? DEFAULTS.confidentialToken;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Activity Feed</h1>
      <ActivityFeedPanel tokenAddress={token} />
    </div>
  );
}
