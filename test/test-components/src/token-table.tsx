"use client";

import { useAllow, useConfidentialBalances, useMetadata } from "@zama-fhe/react-sdk";
import { balanceOfContract, decimalsContract, symbolContract } from "@zama-fhe/sdk";
import type { Address } from "@zama-fhe/sdk";
import { useState } from "react";
import { formatUnits } from "viem";
import { useConnection, useReadContracts } from "wagmi";

function TokenRow({
  address,
  balance,
  revealed,
  isDecrypting,
  LinkComponent,
}: {
  address: Address;
  balance: bigint | undefined;
  revealed: boolean;
  isDecrypting: boolean;
  LinkComponent: React.ComponentType<{
    to: string;
    className?: string;
    children: React.ReactNode;
  }>;
}) {
  const { data: metadata } = useMetadata(address);

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
        <LinkComponent
          to={`/unshield?token=${address}`}
          className="text-zama-yellow hover:underline"
        >
          Unshield
        </LinkComponent>
      </td>
    </tr>
  );
}

function ERC20TokenRow({
  tokenAddress,
  wrapper,
  LinkComponent,
}: {
  tokenAddress: Address;
  wrapper: Address;
  LinkComponent: React.ComponentType<{
    to: string;
    className?: string;
    children: React.ReactNode;
  }>;
}) {
  const { address: connectedAddress } = useConnection();
  const balanceContract = connectedAddress
    ? balanceOfContract(tokenAddress, connectedAddress)
    : undefined;
  const { data, isLoading, error } = useReadContracts({
    contracts: [
      symbolContract(tokenAddress),
      decimalsContract(tokenAddress),
      balanceContract ?? {},
    ],
  });

  const symbol = data?.[0]?.result as string | undefined;
  const decimals = data?.[1]?.result as number | undefined;
  const value = data?.[2]?.result as bigint | undefined;
  const formatted =
    value !== undefined && decimals !== undefined ? formatUnits(value, decimals) : undefined;

  return (
    <tr data-testid={`token-row-${symbol ?? tokenAddress}`}>
      <td className="px-4 py-2">{symbol ?? "..."}</td>
      <td className="px-4 py-2 font-mono text-right" data-testid="balance">
        {error ? "Error" : isLoading ? "..." : (formatted ?? "...")}
      </td>
      <td className="px-4 py-2 text-right">
        <LinkComponent
          to={`/shield?token=${tokenAddress}&wrapper=${wrapper}`}
          className="text-zama-yellow hover:underline"
        >
          Shield
        </LinkComponent>
      </td>
    </tr>
  );
}

export function TokenTable({
  tokenAddresses,
  erc20Tokens = [],
  LinkComponent,
}: {
  tokenAddresses: Address[];
  erc20Tokens?: { address: Address; wrapper: Address }[];
  LinkComponent: React.ComponentType<{
    to: string;
    className?: string;
    children: React.ReactNode;
  }>;
}) {
  const [revealed, setRevealed] = useState(false);
  const { mutate: allow } = useAllow();
  const { data, isFetching, isLoading } = useConfidentialBalances({
    tokenAddresses: revealed ? tokenAddresses : [],
  });

  return (
    <div className="space-y-4">
      <button
        onClick={() =>
          allow(tokenAddresses, {
            onSuccess() {
              setRevealed(!revealed);
            },
          })
        }
        className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover transition-colors"
        disabled={isLoading}
        data-testid="reveal-button"
      >
        {revealed ? "Hide Balances" : "Reveal Balances"}
      </button>
      <table className="w-full" data-testid="token-table">
        <thead>
          <tr className="text-left border-b border-zama-border text-zama-gray">
            <th className="px-4 py-2">Symbol</th>
            <th className="px-4 py-2 text-right">Balance</th>
            <th className="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {erc20Tokens.map((token) => (
            <ERC20TokenRow
              key={token.address}
              tokenAddress={token.address}
              wrapper={token.wrapper}
              LinkComponent={LinkComponent}
            />
          ))}
          {tokenAddresses.map((addr) => (
            <TokenRow
              key={addr}
              address={addr}
              balance={data?.results.get(addr)}
              revealed={revealed}
              isDecrypting={revealed && isFetching}
              LinkComponent={LinkComponent}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
