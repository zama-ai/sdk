import { useDelegationStatus, useToken } from "@zama-fhe/react-sdk";
import type { Address } from "viem";

export function DelegationDot({ tokenAddress }: { tokenAddress: Address }) {
  // shorthand, single property
  const a = useDelegationStatus({ contractAddress: tokenAddress });
  // pair, multiple properties (the realistic call shape)
  const b = useDelegationStatus({ contractAddress: tokenAddress, delegateAddress: tokenAddress });
  // shorthand alongside another property
  const c = useDelegationStatus({ contractAddress: tokenAddress, delegateAddress: tokenAddress });
  // unrelated hook — its tokenAddress must NOT be rewritten
  const d = useToken({ tokenAddress });
  return <span>{(a ?? b ?? c ?? d) ? "ok" : "—"}</span>;
}
