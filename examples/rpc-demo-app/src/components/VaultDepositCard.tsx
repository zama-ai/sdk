"use client";

import { useState } from "react";
import { encodeAbiParameters, encodeFunctionData, isAddress, parseAbi, type Address } from "viem";
import { useRelayedSend } from "@/lib/useRelayedSend";
import { parseAmount } from "@/lib/parseAmount";
import { TraceLog } from "@/components/TraceLog";
import {
  CUSDC_ADDRESS,
  CUSDC_DECIMALS,
  CUSDC_SYMBOL,
  SEPOLIA_EXPLORER_URL,
  VAULT_ADDRESS,
} from "@/lib/config";

// ERC-1363's real transferAndCall shape — same selector
// confidentialTransferAndCallOperation matches on. `data` is the beneficiary
// address, ABI-encoded — ConfidentialVault.sol decodes it the same way.
const TRANSFER_AND_CALL_ABI = parseAbi([
  "function transferAndCall(address to, uint256 amount, bytes data) returns (bool)",
]);

interface VaultDepositCardProps {
  connectedAddress: Address;
}

export function VaultDepositCard({ connectedAddress }: VaultDepositCardProps) {
  const [amount, setAmount] = useState("");
  const [beneficiary, setBeneficiary] = useState<string>(connectedAddress);

  const parsedAmount = parseAmount(amount, CUSDC_DECIMALS);
  const data =
    isAddress(beneficiary) && parsedAmount > 0n
      ? encodeFunctionData({
          abi: TRANSFER_AND_CALL_ABI,
          functionName: "transferAndCall",
          args: [
            VAULT_ADDRESS,
            parsedAmount,
            encodeAbiParameters([{ type: "address" }], [beneficiary]),
          ],
        })
      : undefined;

  const { sendTransaction, hash, status, sendError, receiptStatus, trace } = useRelayedSend();
  const isBusy = status === "sending" || status === "confirming";

  function handleDeposit() {
    if (!data) return;
    void sendTransaction({ from: connectedAddress, to: CUSDC_ADDRESS, data });
  }

  return (
    <div className="card">
      <div className="card-title">Deposit into vault (transferAndCall)</div>
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
        value={beneficiary}
        onChange={(e) => setBeneficiary(e.target.value)}
        placeholder="Beneficiary 0x…"
      />
      <button
        type="button"
        className="btn btn-primary btn-full"
        onClick={handleDeposit}
        disabled={!data || isBusy}
      >
        {status === "sending" ? "Sending…" : status === "confirming" ? "Confirming…" : "Deposit"}
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
          Confirmed — real{" "}
          <a href={`${SEPOLIA_EXPLORER_URL}/tx/${hash}`} target="_blank" rel="noreferrer">
            confidentialTransferAndCall
          </a>{" "}
          into the vault.
        </div>
      )}

      <TraceLog trace={trace} />
    </div>
  );
}
