import { useShield, useConfidentialBalances } from "@zama-fhe/react-sdk";
import type { Address } from "viem";

export function ShieldCard({ tokenAddress }: { tokenAddress: Address }) {
  const { mutate } = useShield({ tokenAddress, wrapperAddress: tokenAddress });
  const balances = useConfidentialBalances({ tokenAddresses: [tokenAddress] });
  return (
    <button onClick={() => mutate({ amount: 1n })} disabled={balances.isLoading}>
      shield
    </button>
  );
}
