import { useConfidentialBalances, useTokenMetadata, type Address } from "@zama-fhe/react-sdk";
import { useBalanceOf } from "@zama-fhe/react-sdk/wagmi";
import { useState } from "react";
import { Link } from "react-router";
import { formatUnits } from "viem";

function TokenRow({
  address,
  balance,
  revealed,
  isDecrypting,
}: {
  address: Address;
  balance: bigint | undefined;
  revealed: boolean;
  isDecrypting: boolean;
}) {
  const { data: metadata } = useTokenMetadata(address);

  return (
    <tr data-testid={`token-row-${metadata?.symbol ?? address}`}>
      <td className="px-4 py-2">{metadata?.symbol ?? "..."}</td>
      <td className="px-4 py-2 font-mono text-right" data-testid="balance">
        {!revealed
          ? "****"
          : isDecrypting
            ? "Decrypting..."
            : balance !== undefined && metadata
              ? formatUnits(balance, metadata.decimals)
              : "..."}
      </td>
      <td className="px-4 py-2 text-right">
        <Link to={`/unshield?token=${address}`} className="text-blue-600 hover:underline">
          Unshield
        </Link>
      </td>
    </tr>
  );
}

function ERC20TokenRow({ address, wrapper }: { address: Address; wrapper: Address }) {
  const { data: balance, isLoading, error } = useBalanceOf({ tokenAddress: address });

  return (
    <tr data-testid={`token-row-${balance.symbol ?? address}`}>
      <td className="px-4 py-2">{balance.symbol ?? "..."}</td>
      <td className="px-4 py-2 font-mono text-right" data-testid="balance">
        {error ? "Error" : isLoading ? "..." : (balance.formatted ?? "...")}
      </td>
      <td className="px-4 py-2 text-right">
        <Link
          to={`/shield?token=${address}&wrapper=${wrapper}`}
          className="text-blue-600 hover:underline"
        >
          Shield
        </Link>
      </td>
    </tr>
  );
}

export function TokenTable({
  tokenAddresses,
  erc20Tokens = [],
}: {
  tokenAddresses: Address[];
  erc20Tokens?: { address: Address; wrapper: Address }[];
}) {
  const [revealed, setRevealed] = useState(false);
  const { data: balances, isFetching } = useConfidentialBalances({
    tokenAddresses: revealed ? tokenAddresses : [],
  });

  return (
    <div className="space-y-4">
      <button
        onClick={() => setRevealed(!revealed)}
        className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
        data-testid="reveal-button"
      >
        {revealed ? "Hide Balances" : "Reveal Balances"}
      </button>
      <table className="w-full" data-testid="token-table">
        <thead>
          <tr className="text-left border-b">
            <th className="px-4 py-2">Symbol</th>
            <th className="px-4 py-2 text-right">Balance</th>
            <th className="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {erc20Tokens.map((token) => (
            <ERC20TokenRow key={token.address} address={token.address} wrapper={token.wrapper} />
          ))}
          {tokenAddresses.map((addr) => (
            <TokenRow
              key={addr}
              address={addr}
              balance={balances?.get(addr)}
              revealed={revealed}
              isDecrypting={revealed && isFetching}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
