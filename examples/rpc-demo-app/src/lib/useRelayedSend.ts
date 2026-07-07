import { useState } from "react";
import { useWaitForTransactionReceipt } from "wagmi";
import type { Address, Hex } from "viem";
import { ZAMA_RPC_URL } from "@/lib/config";

/**
 * Sends `eth_sendTransaction` directly to the zama-json-rpc wrapper via
 * `fetch`, instead of wagmi's `useSendTransaction` (which delegates to the
 * connected wallet's own provider). Necessary, not a style choice: a real
 * wallet signs client-side before any network call and only ever sends the
 * already-signed `eth_sendRawTransaction` — the wrapper can only rewrite the
 * *unsigned* request, so it must be the one to receive `eth_sendTransaction`
 * directly. See `scripts/signer-relay.mjs` for what completes the sign+
 * broadcast step on the other side.
 */
export function useRelayedSend() {
  const [hash, setHash] = useState<Hex>();
  const [isPending, setIsPending] = useState(false);
  const [sendError, setSendError] = useState<string>();

  const receipt = useWaitForTransactionReceipt({ hash });

  async function sendTransaction(params: { from: Address; to: Address; data: Hex }) {
    setIsPending(true);
    setSendError(undefined);
    setHash(undefined);
    try {
      const response = await fetch(ZAMA_RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "eth_sendTransaction",
          params: [params],
        }),
      });
      const json = await response.json();
      if (json.error) {
        setSendError(json.error.message ?? "Request failed");
        return;
      }
      setHash(json.result as Hex);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPending(false);
    }
  }

  return { sendTransaction, hash, isPending, sendError, receipt };
}
