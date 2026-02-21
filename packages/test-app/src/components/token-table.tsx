"use client";

import { useState } from "react";
import { useConfidentialBalances, useTokenMetadata, type Address } from "@zama-fhe/token-react-sdk";
import Link from "next/link";

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
      <td className="px-4 py-2">{metadata?.name ?? "..."}</td>
      <td className="px-4 py-2 font-mono" data-testid="balance">
        {!revealed
          ? "****"
          : isDecrypting
            ? "Decrypting..."
            : balance !== undefined
              ? balance.toString()
              : "..."}
      </td>
      <td className="px-4 py-2 flex gap-2">
        <Link href={`/shield?token=${address}`} className="text-blue-600 hover:underline">
          Shield
        </Link>
        <Link href={`/unshield?token=${address}`} className="text-blue-600 hover:underline">
          Unshield
        </Link>
      </td>
    </tr>
  );
}

export function TokenTable({ tokenAddresses }: { tokenAddresses: Address[] }) {
  const [revealed, setRevealed] = useState(false);
  const { data: balances, isFetching } = useConfidentialBalances(revealed ? tokenAddresses : []);

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
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Balance</th>
            <th className="px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
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
