import { useDelegationStatus, useToken } from "@zama-fhe/react-sdk";
import type { Address } from "viem";

export function DelegationDot({ tokenAddress }: { tokenAddress: Address }) {
  // shorthand, single property
  const a = useDelegationStatus({ tokenAddress });
  // pair, multiple properties (the realistic call shape)
  const b = useDelegationStatus({ tokenAddress: tokenAddress, delegateAddress: tokenAddress });
  // shorthand alongside another property
  const c = useDelegationStatus({ tokenAddress, delegateAddress: tokenAddress });
  // unrelated hook — its tokenAddress must NOT be rewritten
  const d = useToken({ tokenAddress });
  return <span>{(a ?? b ?? c ?? d) ? "ok" : "—"}</span>;
}
