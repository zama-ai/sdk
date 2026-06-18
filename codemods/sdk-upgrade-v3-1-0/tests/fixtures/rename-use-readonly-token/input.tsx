import { useReadonlyToken } from "@zama-fhe/react-sdk";
import type { Address } from "viem";

export function TokenCard({ address }: { address: Address }) {
  const token = useReadonlyToken(address);
  if (!token.data) {
    return null;
  }
  return <div>token: {token.data.symbol}</div>;
}
