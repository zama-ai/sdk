"use client";

import { useEffect, useState } from "react";
import { getAddress, type Address } from "viem";
import { sepolia } from "viem/chains";
import { BatchList } from "@/components/BatchList";
import { VaultForm } from "@/components/VaultForm";
import { IS_CONFIGURED, VAULT } from "@/lib/config";
import { Providers } from "@/providers";

const SEPOLIA_CHAIN_ID_HEX = `0x${sepolia.id.toString(16)}`;

export default function Home() {
  const [hasWallet, setHasWallet] = useState(true);
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<string>();

  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum) {
      setHasWallet(false);
      return;
    }
    const onAccounts = (accounts: string[]) =>
      setAccount(accounts[0] ? getAddress(accounts[0]) : undefined);
    const onChain = (id: string) => setChainId(id.toLowerCase());
    void ethereum.request({ method: "eth_accounts" }).then(onAccounts);
    void ethereum.request({ method: "eth_chainId" }).then(onChain);
    ethereum.on("accountsChanged", onAccounts);
    ethereum.on("chainChanged", onChain);
    return () => {
      ethereum.removeListener("accountsChanged", onAccounts);
      ethereum.removeListener("chainChanged", onChain);
    };
  }, []);

  if (!IS_CONFIGURED) {
    return (
      <main>
        <p>Set the batcher addresses in .env.local (see .env.example), then restart the app.</p>
      </main>
    );
  }
  if (!hasWallet) {
    return (
      <main>
        <p>Install a browser wallet to use this app.</p>
      </main>
    );
  }
  if (!account) {
    return (
      <main>
        <button onClick={() => void window.ethereum?.request({ method: "eth_requestAccounts" })}>
          Connect wallet
        </button>
      </main>
    );
  }
  if (chainId !== SEPOLIA_CHAIN_ID_HEX) {
    return (
      <main>
        <button
          onClick={() =>
            void window.ethereum?.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
            })
          }
        >
          Switch to Sepolia
        </button>
      </main>
    );
  }

  return (
    // Keyed on the account: a new account gets a fresh signer and SDK instance.
    <Providers key={account} account={account}>
      <main>
        <p>
          Connected as {account}{" "}
          <button
            onClick={() => {
              // Drops the site's wallet permission where the wallet supports it, so a
              // reload does not reconnect silently. The local state is cleared either way.
              void window.ethereum
                ?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] })
                .catch(() => {});
              setAccount(undefined);
            }}
          >
            Disconnect
          </button>
        </p>
        <VaultForm account={account} />
        <BatchList title="Deposits" batcher={VAULT.depositBatcher} account={account} />
        <BatchList title="Withdrawals" batcher={VAULT.redeemBatcher} account={account} />
      </main>
    </Providers>
  );
}
