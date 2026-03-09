"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import {
  useConfidentialBalance,
  useShield,
  useConfidentialTransfer,
  useUnshield,
  useMetadata,
} from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/react-sdk";

const TOKEN_ADDRESS = `0x${"aa".repeat(20)}` as Address; // Replace with your token address
const WRAPPER_ADDRESS = `0x${"bb".repeat(20)}` as Address; // Replace with your wrapper address

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");

  const metadata = useMetadata(TOKEN_ADDRESS);
  const balance = useConfidentialBalance({ tokenAddress: TOKEN_ADDRESS });
  const shield = useShield({ tokenAddress: TOKEN_ADDRESS, wrapperAddress: WRAPPER_ADDRESS });
  const transfer = useConfidentialTransfer({ tokenAddress: TOKEN_ADDRESS });
  const unshield = useUnshield({ tokenAddress: TOKEN_ADDRESS, wrapperAddress: WRAPPER_ADDRESS });

  if (!isConnected) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui" }}>
        <h1>Confidential Token Demo</h1>
        <button onClick={() => connect({ connector: injected() })} style={buttonStyle}>
          Connect Wallet
        </button>
      </div>
    );
  }

  const parsedAmount = BigInt(amount || "0");

  return (
    <div style={{ padding: 40, fontFamily: "system-ui", maxWidth: 600 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Confidential Token Demo</h1>
        <button onClick={() => disconnect()} style={buttonStyle}>
          Disconnect
        </button>
      </div>

      <p>
        Connected: <code>{address}</code>
      </p>

      {metadata.data && (
        <p>
          Token: {metadata.data.name} ({metadata.data.symbol}) — {metadata.data.decimals} decimals
        </p>
      )}

      <p style={{ fontSize: 24 }}>
        Balance: {balance.isLoading ? "Decrypting..." : (balance.data?.toString() ?? "—")}
      </p>

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
          disabled={shield.isPending || !amount}
          style={buttonStyle}
        >
          {shield.isPending ? "Shielding..." : "Shield"}
        </button>
      </div>

      {/* Transfer */}
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
          disabled={transfer.isPending || !amount || !recipient}
          style={{ ...buttonStyle, marginLeft: 8 }}
        >
          {transfer.isPending ? "Transferring..." : "Transfer"}
        </button>
      </div>

      {/* Unshield */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => unshield.mutate({ amount: parsedAmount })}
          disabled={unshield.isPending || !amount}
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
      {(shield.isSuccess || transfer.isSuccess || unshield.isSuccess) && (
        <p style={{ color: "green" }}>Transaction confirmed!</p>
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
