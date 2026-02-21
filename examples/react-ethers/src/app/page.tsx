"use client";

import { useState } from "react";
import {
  useConfidentialBalance,
  useShield,
  useConfidentialTransfer,
  useUnshield,
  useTokenMetadata,
} from "@zama-fhe/token-react-sdk";
import type { Address } from "@zama-fhe/token-react-sdk";

const TOKEN_ADDRESS = "0x..." as Address; // Replace with your token address
const WRAPPER_ADDRESS = "0x..." as Address; // Replace with your wrapper address

export default function Home() {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");

  const metadata = useTokenMetadata(TOKEN_ADDRESS);
  const balance = useConfidentialBalance(TOKEN_ADDRESS);
  const shield = useShield({ tokenAddress: TOKEN_ADDRESS, wrapperAddress: WRAPPER_ADDRESS });
  const transfer = useConfidentialTransfer({ tokenAddress: TOKEN_ADDRESS });
  const unshield = useUnshield({ tokenAddress: TOKEN_ADDRESS, wrapperAddress: WRAPPER_ADDRESS });

  const parsedAmount = BigInt(amount || "0");

  return (
    <div style={{ padding: 40, fontFamily: "system-ui", maxWidth: 600 }}>
      <h1>Confidential Token Demo</h1>

      {metadata.data && (
        <p>
          Token: {metadata.data.name} ({metadata.data.symbol}) — {metadata.data.decimals} decimals
        </p>
      )}

      <p style={{ fontSize: 24 }}>
        Balance: {balance.isLoading ? "Decrypting..." : (balance.data?.toString() ?? "—")}
      </p>

      <hr style={{ margin: "24px 0" }} />

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

      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => shield.mutate({ amount: parsedAmount })}
          disabled={shield.isPending || !amount}
          style={buttonStyle}
        >
          {shield.isPending ? "Shielding..." : "Shield"}
        </button>
      </div>

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

      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => unshield.mutate({ amount: parsedAmount })}
          disabled={unshield.isPending || !amount}
          style={buttonStyle}
        >
          {unshield.isPending ? "Unshielding..." : "Unshield"}
        </button>
      </div>

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
