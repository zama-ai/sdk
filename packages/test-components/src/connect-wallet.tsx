"use client";

import { useAccount, useConnect, useDisconnect, useConnectors } from "wagmi";

const BURNER_PK_KEY = "burnerWallet.pk";

/**
 * Picks the right connector based on environment:
 * - If a burner private key is in localStorage, use the burner connector (Playwright / E2E)
 * - Otherwise, use the injected connector (MetaMask / browser wallet)
 */
function pickConnector(connectors: readonly { id: string; name: string }[]) {
  const hasBurnerPk = typeof window !== "undefined" && Boolean(localStorage.getItem(BURNER_PK_KEY));

  if (hasBurnerPk) {
    return connectors.find((c) => c.id === "burnerWallet") ?? connectors[0];
  }
  return connectors.find((c) => c.id === "injected") ?? connectors[0];
}

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const connectors = useConnectors();

  if (isConnected) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span data-testid="wallet-address" className="font-mono text-xs text-zama-gray">
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </span>
        <button
          onClick={() => disconnect()}
          className="px-2.5 py-1 text-xs bg-zama-surface text-zama-gray rounded border border-zama-border hover:text-white hover:border-zama-gray transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        const connector = pickConnector(connectors);
        if (connector)
          connect({ connector: connector as Parameters<typeof connect>[0]["connector"] });
      }}
      className="px-2.5 py-1 text-xs font-medium bg-zama-yellow text-zama-black rounded hover:bg-zama-yellow-hover transition-colors"
    >
      Connect Wallet
    </button>
  );
}
