import { useConfidentialBalance } from "@zama-fhe/react-sdk";
import type { Address } from "viem";

export function Balance({ tokenAddress }: { tokenAddress: Address }) {
  // A line comment INSIDE the object literal: tree-sitter treats it as a named
  // child, so it used to be reassembled into the rebuilt object and break the output.
  const balance = useConfidentialBalance({ address: tokenAddress, account: tokenAddress });
  return <span>{String(balance.isLoading)}</span>;
}
