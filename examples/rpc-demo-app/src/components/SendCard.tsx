"use client";

import { useState } from "react";
import { encodeFunctionData, isAddress, parseAbi, type Address } from "viem";
import { useRelayedSend } from "@/lib/useRelayedSend";
import { parseAmount } from "@/lib/parseAmount";
import { TraceLog } from "@/components/TraceLog";
import { CUSDC_ADDRESS, CUSDC_DECIMALS, CUSDC_SYMBOL, SEPOLIA_EXPLORER_URL } from "@/lib/config";

// The exact same "public-looking" ABI zama-json-rpc's confidentialTransfer
// operation matches on (examples/zama-json-rpc/src/registry/operations/
// confidential-transfer.ts) — an ordinary ERC-20 `transfer`. This app never
// encrypts anything; it just builds this one, boring call.
const TRANSFER_ABI = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

interface SendCardProps {
  connectedAddress: Address;
}

export function SendCard({ connectedAddress }: SendCardProps) {
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");

  const parsedAmount = parseAmount(amount, CUSDC_DECIMALS);
  const data =
    isAddress(recipient) && parsedAmount > 0n
      ? encodeFunctionData({
          abi: TRANSFER_ABI,
          functionName: "transfer",
          args: [recipient, parsedAmount],
        })
      : undefined;

  const { sendTransaction, retryPolling, hash, status, sendError, receiptStatus, trace } =
    useRelayedSend();
  const isBusy = status === "sending" || status === "confirming";

  function handleSend() {
    if (!data) return;
    void sendTransaction({ from: connectedAddress, to: CUSDC_ADDRESS, data });
  }

  return (
    <div className="card">
      <div className="card-title">Send (plain transfer(to, amount))</div>
      <div className="input-row card-gap">
        <input
          className="input"
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />
        <span className="input-unit">{CUSDC_SYMBOL}</span>
      </div>
      <input
        className="input card-gap"
        type="text"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        placeholder="0x…"
      />
      <button
        type="button"
        className="btn btn-primary btn-full"
        onClick={handleSend}
        disabled={!data || isBusy}
      >
        {status === "sending" ? "Sending…" : status === "confirming" ? "Confirming…" : "Send"}
      </button>

      {data && (
        <>
          <div className="raw-request-label">Raw eth_sendTransaction payload</div>
          <pre className="raw-request">
            {JSON.stringify({ from: connectedAddress, to: CUSDC_ADDRESS, data }, null, 2)}
          </pre>
        </>
      )}

      {sendError && <div className="alert alert-error card-status">{sendError}</div>}
      {status === "reverted" && hash && (
        <div className="alert alert-error card-status">
          Transaction reverted —{" "}
          <a href={`${SEPOLIA_EXPLORER_URL}/tx/${hash}`} target="_blank" rel="noreferrer">
            {hash.slice(0, 10)}…
          </a>
        </div>
      )}
      {status === "confirmed" && hash && receiptStatus === "success" && (
        <div className="alert alert-success card-status">
          Confirmed — check Etherscan for the real (encrypted) call this became:{" "}
          <a href={`${SEPOLIA_EXPLORER_URL}/tx/${hash}`} target="_blank" rel="noreferrer">
            {hash.slice(0, 10)}…
          </a>
        </div>
      )}
      {status === "timeout" && hash && (
        <div className="alert alert-error card-status">
          Gave up waiting for a receipt — the transaction may still be pending.{" "}
          <a href={`${SEPOLIA_EXPLORER_URL}/tx/${hash}`} target="_blank" rel="noreferrer">
            Check Etherscan
          </a>{" "}
          or{" "}
          <button type="button" className="btn-link" onClick={retryPolling}>
            keep polling
          </button>
          .
        </div>
      )}

      <TraceLog trace={trace} />
    </div>
  );
}
