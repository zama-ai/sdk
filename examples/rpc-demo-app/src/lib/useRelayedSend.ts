import { useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { ZAMA_RPC_URL } from "@/lib/config";
import { traceEntry, type TraceEntry } from "@/lib/trace";

const WRAPPER_HOP = "Browser → zama-json-rpc (localhost:8545)";
const WRAPPER_RESPONSE_HOP = "zama-json-rpc → Browser";
const RELAY_HOP = "zama-json-rpc → signer-relay → real Sepolia";

interface AuditEntry {
  decision: "passthrough" | "rewritten" | "rejected";
  method: string;
  contractAddress?: string;
  operation?: string;
  reason?: string;
}

async function fetchRecentAudit(sinceMs: number): Promise<AuditEntry[]> {
  try {
    const auditUrl = new URL("/audit", ZAMA_RPC_URL).toString();
    const response = await fetch(auditUrl);
    if (!response.ok) return [];
    const body = (await response.json()) as { entries: { timestamp: string; entry: AuditEntry }[] };
    return body.entries
      .filter((e) => new Date(e.timestamp).getTime() >= sinceMs)
      .map((e) => e.entry);
  } catch {
    return [];
  }
}

type Status = "idle" | "sending" | "confirming" | "confirmed" | "reverted" | "error";

/**
 * Sends `eth_sendTransaction` directly to the zama-json-rpc wrapper via
 * `fetch`, instead of wagmi's `useSendTransaction` (which delegates to the
 * connected wallet's own provider). Necessary, not a style choice: a real
 * wallet signs client-side before any network call and only ever sends the
 * already-signed `eth_sendRawTransaction` — the wrapper can only rewrite the
 * *unsigned* request, so it must be the one to receive `eth_sendTransaction`
 * directly. See `scripts/signer-relay.mjs` for what completes the sign+
 * broadcast step on the other side.
 *
 * Also builds a `trace`: every request/response this browser genuinely
 * exchanges with the wrapper (full payloads), interleaved with the wrapper's
 * own real audit-log entries (polled from `GET /audit`) and one clearly
 * labeled *inferred* step for the signer-relay → real-chain hop, which isn't
 * directly observable from here.
 */
export function useRelayedSend() {
  const [hash, setHash] = useState<Hex>();
  const [status, setStatus] = useState<Status>("idle");
  const [sendError, setSendError] = useState<string>();
  const [receiptStatus, setReceiptStatus] = useState<"success" | "reverted">();
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const stopPolling = useRef(false);

  function append(entry: Omit<TraceEntry, "id" | "timestamp">) {
    setTrace((prev) => [...prev, traceEntry(entry)]);
  }

  async function pollReceipt(txHash: Hex) {
    setStatus("confirming");
    stopPolling.current = false;
    for (let attempt = 1; !stopPolling.current; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const body = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "eth_getTransactionReceipt",
        params: [txHash],
      };
      append({
        hop: WRAPPER_HOP,
        kind: "request",
        summary: `eth_getTransactionReceipt (poll #${attempt})`,
        detail: body,
      });
      const response = await fetch(ZAMA_RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      const receipt = json.result;
      if (!receipt) {
        append({
          hop: WRAPPER_RESPONSE_HOP,
          kind: "response",
          summary: "Not mined yet",
          detail: json,
        });
        continue;
      }
      append({
        hop: WRAPPER_RESPONSE_HOP,
        kind: "response",
        summary: `Mined — status: ${receipt.status === "0x1" ? "success" : "reverted"}, block ${parseInt(receipt.blockNumber, 16)}, gas ${parseInt(receipt.gasUsed, 16)}`,
        detail: receipt,
      });
      setReceiptStatus(receipt.status === "0x1" ? "success" : "reverted");
      setStatus(receipt.status === "0x1" ? "confirmed" : "reverted");
      return;
    }
  }

  async function sendTransaction(params: { from: Address; to: Address; data: Hex }) {
    setStatus("sending");
    setSendError(undefined);
    setHash(undefined);
    setReceiptStatus(undefined);
    setTrace([]);
    const startedAt = Date.now();

    const body = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "eth_sendTransaction",
      params: [params],
    };
    append({
      hop: WRAPPER_HOP,
      kind: "request",
      summary: "eth_sendTransaction — plain, ordinary-looking calldata",
      detail: body,
    });

    try {
      const response = await fetch(ZAMA_RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json();

      if (json.error) {
        append({
          hop: WRAPPER_RESPONSE_HOP,
          kind: "response",
          summary: `Rejected: ${json.error.message}`,
          detail: json,
        });
        setSendError(json.error.message ?? "Request failed");
        setStatus("error");
        return;
      }

      append({
        hop: WRAPPER_RESPONSE_HOP,
        kind: "response",
        summary: `Accepted — tx hash ${json.result.slice(0, 10)}…`,
        detail: json,
      });

      const auditEntries = await fetchRecentAudit(startedAt);
      const rewritten = auditEntries.find((e) => e.decision === "rewritten");
      if (rewritten) {
        append({
          hop: "zama-json-rpc (server-side)",
          kind: "server-audit",
          summary: `Matched "${rewritten.operation}" — encrypted the amount via the real Zama relayer, rewrote the calldata`,
          detail: rewritten,
        });
      }

      append({
        hop: RELAY_HOP,
        kind: "inferred",
        summary:
          "Signer relay signs the rewritten call and broadcasts it via eth_sendRawTransaction " +
          "to the real chain — not directly observable from the browser, inferred from the " +
          "final receipt below.",
      });

      setHash(json.result as Hex);
      await pollReceipt(json.result as Hex);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : String(error));
      setStatus("error");
    }
  }

  return { sendTransaction, hash, status, sendError, receiptStatus, trace };
}
