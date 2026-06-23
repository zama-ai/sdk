import {
  useShield,
  useConfidentialBalance,
  useConfidentialBalances,
  useConfidentialTransfer,
} from "@zama-fhe/react-sdk";
import type { Address } from "viem";

export function ShieldCard({ tokenAddress }: { tokenAddress: Address }) {
  const { mutate } = useShield(
    // For ERC-7984 tokens the wrapper IS the token (leading comment before the config).
    { address: tokenAddress },
    { onSuccess: () => {} },
  );
  const balances = useConfidentialBalances({ addresses: [tokenAddress] });

  // Multi-property config + a second (options) argument — the shapes the
  // single-property ast-grep pattern used to miss.
  const balance = useConfidentialBalance(
    { address: tokenAddress, account: tokenAddress },
    { enabled: true },
  );
  const transfer = useConfidentialTransfer({ address: tokenAddress }, { onSuccess: () => {} });

  return (
    <button
      onClick={() => mutate({ amount: 1n })}
      disabled={balances.isLoading || balance.isLoading || transfer.isPending}
    >
      shield
    </button>
  );
}
