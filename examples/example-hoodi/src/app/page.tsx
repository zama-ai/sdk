"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { JsonRpcProvider, Contract } from "ethers";
import {
  useConfidentialBalance,
  useShield,
  useConfidentialTransfer,
  useUnshield,
  useMetadata,
} from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/react-sdk";

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];
const HOODI_RPC = process.env.NEXT_PUBLIC_HOODI_RPC_URL || "https://rpc.hoodi.ethpandaops.io";
const HOODI_CHAIN_ID = 560048;
const HOODI_CHAIN_ID_HEX = "0x88BB0";

// Hoodi token pairs: confidential address is the ERC-7984 wrapper, used for all SDK hooks.
// The underlying ERC-20 is resolved automatically via underlying() — only used here for
// displaying the public balance.
const TOKENS = {
  usdt: {
    label: "USDT Mock",
    erc20: "0x51a63b5621D78dE54D2F4D098A23a5A69e76F30b" as Address,
    confidential: "0x2dEBbe0487Ef921dF4457F9E36eD05Be2df1AC75" as Address,
  },
  test: {
    label: "Test Token",
    erc20: "0x7740F913dC24D4F9e1A72531372c3170452B2F87" as Address,
    confidential: "0x7B1d59BbCD291DAA59cb6C8C5Bc04de1Afc4Aba1" as Address,
  },
} as const;

type TokenKey = keyof typeof TOKENS;

export default function Home() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<TokenKey>("usdt");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");

  const token = TOKENS[selectedToken];
  const isHoodi = chainId !== null && parseInt(chainId, 16) === HOODI_CHAIN_ID;

  // Detect existing connection and listen for account/chain changes
  useEffect(() => {
    if (!window.ethereum) return;

    (window.ethereum.request({ method: "eth_accounts" }) as Promise<string[]>).then((accounts) =>
      setAddress(accounts[0] ?? null),
    );
    (window.ethereum.request({ method: "eth_chainId" }) as Promise<string>).then(setChainId);

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      setAddress(accounts[0] ?? null);
    };
    const handleChainChanged = (...args: unknown[]) => setChainId(args[0] as string);

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  async function connect() {
    if (!window.ethereum) {
      alert("MetaMask not found. Please install MetaMask to use this app.");
      return;
    }

    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      // Switch to Hoodi — add the network if MetaMask doesn't know it yet
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: HOODI_CHAIN_ID_HEX }],
        });
      } catch (switchError: unknown) {
        if ((switchError as { code: number }).code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: HOODI_CHAIN_ID_HEX,
                chainName: "Hoodi",
                nativeCurrency: { name: "Hoodi Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: [
                  process.env.NEXT_PUBLIC_HOODI_RPC_URL || "https://rpc.hoodi.ethpandaops.io",
                ],
                blockExplorerUrls: ["https://hoodi.etherscan.io"],
              },
            ],
          });
        } else {
          throw switchError;
        }
      }

      setAddress(accounts[0] ?? null);
      setChainId(HOODI_CHAIN_ID_HEX);
    } catch (err) {
      console.error("Failed to connect wallet:", err);
    }
  }

  // SDK hooks — always called (React rules of hooks)
  const queryClient = useQueryClient();
  const metadata = useMetadata(token.confidential);

  const erc20BalanceKey = ["erc20-balance", token.erc20, address];
  const { data: erc20Balance } = useQuery({
    queryKey: erc20BalanceKey,
    queryFn: async () => {
      const provider = new JsonRpcProvider(HOODI_RPC);
      const contract = new Contract(token.erc20, ERC20_ABI, provider);
      return contract.balanceOf(address) as Promise<bigint>;
    },
    enabled: !!address,
  });
  const refreshErc20 = () => queryClient.invalidateQueries({ queryKey: erc20BalanceKey });

  const balance = useConfidentialBalance({ tokenAddress: token.confidential });

  const shield = useShield(
    { tokenAddress: token.confidential, wrapperAddress: token.confidential },
    { onSuccess: refreshErc20 },
  );
  const transfer = useConfidentialTransfer({ tokenAddress: token.confidential });
  const unshield = useUnshield(
    { tokenAddress: token.confidential, wrapperAddress: token.confidential },
    { onSuccess: refreshErc20 },
  );

  const parsedAmount = BigInt(amount || "0");
  const anyPending = shield.isPending || transfer.isPending || unshield.isPending;
  const actionsDisabled = anyPending || !isHoodi;
  const lastTxHash =
    (shield.isSuccess && shield.data?.txHash) ||
    (transfer.isSuccess && transfer.data?.txHash) ||
    (unshield.isSuccess && unshield.data?.txHash) ||
    null;

  // Not connected — show connect screen
  if (!address) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui" }}>
        <h1>Hoodi Confidential Token Demo</h1>
        <p style={{ color: "#555" }}>
          Connect your MetaMask wallet to get started. The app will automatically switch to the
          Hoodi network.
        </p>
        <button onClick={connect} style={buttonStyle}>
          Connect MetaMask
        </button>
      </div>
    );
  }

  // Connected — show main UI
  return (
    <div style={{ padding: 40, fontFamily: "system-ui", maxWidth: 640 }}>
      <h1>Hoodi Confidential Token Demo</h1>
      <p style={{ color: "#666", fontSize: 13 }}>Connected: {address}</p>

      {/* Wrong network banner */}
      {!isHoodi && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: "#fff3cd",
            border: "1px solid #ffc107",
            borderRadius: 6,
          }}
        >
          <strong>Wrong network</strong> — switch to Hoodi (chainId 560048) to use this app.{" "}
          <button
            onClick={() =>
              window.ethereum?.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: HOODI_CHAIN_ID_HEX }],
              })
            }
            style={{ ...buttonStyle, marginLeft: 8 }}
          >
            Switch to Hoodi
          </button>
        </div>
      )}

      {/* Token selector */}
      <div style={{ marginBottom: 24 }}>
        <label>
          Token:{" "}
          <select
            value={selectedToken}
            onChange={(e) => setSelectedToken(e.target.value as TokenKey)}
            style={selectStyle}
          >
            {(Object.keys(TOKENS) as TokenKey[]).map((key) => (
              <option key={key} value={key}>
                {TOKENS[key].label}
              </option>
            ))}
          </select>
        </label>
        {metadata.data && (
          <span style={{ marginLeft: 12, color: "#666", fontSize: 13 }}>
            {metadata.data.name} ({metadata.data.symbol}) — {metadata.data.decimals} decimals
          </span>
        )}
      </div>

      {/* Balances */}
      <div style={{ marginBottom: 24, padding: 16, background: "#f5f5f5", borderRadius: 8 }}>
        <div style={{ marginBottom: 8 }}>
          <strong>ERC-20 balance:</strong>{" "}
          {erc20Balance !== undefined ? erc20Balance.toString() : "—"}
        </div>
        <div>
          <strong>Confidential balance:</strong>{" "}
          {balance.isLoading ? "Decrypting..." : (balance.data?.toString() ?? "—")}
        </div>
      </div>

      <hr style={{ margin: "24px 0" }} />

      {/* Amount input */}
      <div style={{ marginBottom: 16 }}>
        <label>
          Amount:{" "}
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            style={inputStyle}
          />
        </label>
      </div>

      {/* Shield */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => shield.mutate({ amount: parsedAmount })}
          disabled={actionsDisabled || !amount}
          style={buttonStyle}
        >
          {shield.isPending ? "Shielding..." : "Shield"}
        </button>
      </div>

      {/* Confidential transfer */}
      <div style={{ marginBottom: 16 }}>
        <label>
          Recipient:{" "}
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="0x..."
            style={{ ...inputStyle, width: 360 }}
          />
        </label>
        <button
          onClick={() => transfer.mutate({ to: recipient as Address, amount: parsedAmount })}
          disabled={actionsDisabled || !amount || !recipient}
          style={{ ...buttonStyle, marginLeft: 8 }}
        >
          {transfer.isPending ? "Transferring..." : "Transfer"}
        </button>
      </div>

      {/* Unshield */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => unshield.mutate({ amount: parsedAmount })}
          disabled={actionsDisabled || !amount}
          style={buttonStyle}
        >
          {unshield.isPending ? "Unshielding..." : "Unshield"}
        </button>
      </div>

      {/* Status */}
      {(shield.isError || transfer.isError || unshield.isError) && (
        <p style={{ color: "red" }}>
          Error: {(shield.error ?? transfer.error ?? unshield.error)?.message}
        </p>
      )}
      {lastTxHash && (
        <p style={{ color: "green" }}>
          Transaction confirmed!{" "}
          <a
            href={`https://hoodi.etherscan.io/tx/${lastTxHash}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: "green" }}
          >
            {lastTxHash.slice(0, 10)}…
          </a>
        </p>
      )}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: 14,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 14,
  width: 120,
};

const selectStyle: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 14,
};
