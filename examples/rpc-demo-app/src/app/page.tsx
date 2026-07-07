"use client";

import { formatEther } from "viem";
import { useAccount, useBalance, useConnect, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors";
import { sepolia } from "wagmi/chains";
import { SendCard } from "@/components/SendCard";
import { VaultDepositCard } from "@/components/VaultDepositCard";
import { HistoryCard } from "@/components/HistoryCard";
import { DelegationStatusBadge } from "@/components/DelegationStatusBadge";
import { SEPOLIA_CHAIN_ID } from "@/lib/config";

export default function Home() {
  const { address, chainId, isConnected } = useAccount();
  const { connect, isPending: isConnecting, error: connectError } = useConnect();
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();

  const isSepolia = chainId === SEPOLIA_CHAIN_ID;

  const { data: ethBalanceData } = useBalance({
    address,
    query: { enabled: isConnected && isSepolia },
  });

  // ── Screen 1: No wallet connected ─────────────────────────────────────────
  if (!isConnected) {
    const isNoWallet = (connectError?.name as string) === "ProviderNotFoundError";
    return (
      <div className="app-container connect-screen">
        <h1>Zama Privacy Service Demo</h1>
        <p className="subtitle">
          Connect your wallet. This app never imports the Zama SDK — see README.md before
          connecting: MetaMask's Sepolia RPC needs to point at the local zama-json-rpc wrapper for
          Send/Deposit to actually go through it.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => connect({ connector: injected() })}
          disabled={isConnecting}
        >
          {isConnecting ? "Connecting…" : "Connect Wallet"}
        </button>
        {isNoWallet && (
          <div className="alert alert-error card-status">
            No Ethereum wallet found. Please install MetaMask (or another EIP-1193 wallet).
          </div>
        )}
        {connectError && !isNoWallet && (
          <div className="alert alert-error card-status">{connectError.message}</div>
        )}
      </div>
    );
  }

  // ── Screen 2: Wrong network ────────────────────────────────────────────────
  if (!isSepolia) {
    return (
      <div className="app-container connect-screen">
        <h1>Sepolia Network Required</h1>
        <p className="subtitle">
          This app only works on the Sepolia testnet (chain ID {SEPOLIA_CHAIN_ID}). Switch your
          wallet to continue.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => switchChain({ chainId: sepolia.id })}
          disabled={isSwitching}
        >
          {isSwitching ? "Switching…" : "Switch to Sepolia"}
        </button>
        {switchError && (
          <div className="alert alert-error card-status">
            Could not switch to Sepolia. Please switch manually in your wallet.
          </div>
        )}
      </div>
    );
  }

  // ── Screen 3: Connected on Sepolia — main UI ───────────────────────────────
  return (
    <div className="app-container">
      <div className="app-header">
        <h1>Zama Privacy Service Demo</h1>
        <div className="connected-address">Connected: {address}</div>
        <div className="connected-address">
          ETH:{" "}
          {ethBalanceData !== undefined
            ? Number(formatEther(ethBalanceData.value)).toFixed(4)
            : "—"}
        </div>
      </div>

      {address && (
        <>
          <SendCard connectedAddress={address} />
          <VaultDepositCard connectedAddress={address} />

          <div className="card">
            <div className="card-title">Delegation</div>
            <DelegationStatusBadge connectedAddress={address} />
          </div>

          <HistoryCard connectedAddress={address} />
        </>
      )}
    </div>
  );
}
