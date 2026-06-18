import { useDelegationStatus } from "@zama-fhe/react-sdk";
import type { Address } from "viem";

export function DelegationDot({ tokenAddress }: { tokenAddress: Address }) {
  const { data } = useDelegationStatus({ tokenAddress });
  return <span>{data?.status ?? "—"}</span>;
}
