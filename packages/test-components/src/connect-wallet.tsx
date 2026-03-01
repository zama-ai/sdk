"use client";

import { useAccount, useConnect, useDisconnect, useConnectors } from "wagmi";

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const connectors = useConnectors();

  if (isConnected) {
    return (
      <div className="flex items-center gap-2">
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
      onClick={() => connect({ connector: connectors[0]! })}
      className="px-3 py-1.5 text-sm font-medium bg-zama-yellow text-zama-black rounded hover:bg-zama-yellow-hover transition-colors"
    >
      Connect Wallet
    </button>
  );
}
