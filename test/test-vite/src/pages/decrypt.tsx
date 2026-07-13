import { DecryptPanel } from "@zama-fhe/test-components";
import { useSearchParams } from "react-router";
import { getAddress } from "viem";
import { CONFIDENTIAL_TOKEN_ADDRESSES, DEFAULTS } from "../constants";

export default function DecryptPage() {
  const [searchParams] = useSearchParams();
  const token = getAddress(searchParams.get("token") ?? DEFAULTS.confidentialToken);
  const secondToken = getAddress(
    searchParams.get("secondToken") ?? CONFIDENTIAL_TOKEN_ADDRESSES[1]!,
  );
  const delegator = getAddress(searchParams.get("delegator") ?? DEFAULTS.confidentialToken);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Decrypt Variants</h1>
      <DecryptPanel
        tokenAddress={token}
        secondTokenAddress={secondToken}
        delegatorAddress={delegator}
      />
    </div>
  );
}
