// Persistent companion process — sits as zama-json-rpc's `--rpcUrl` upstream.
//
// Why this exists (not a shortcut, a hard requirement): any real EIP-1193
// wallet (MetaMask, Rabby, ...) signs `eth_sendTransaction` client-side, inside
// the extension, BEFORE ever making a network call — it never forwards
// `eth_sendTransaction` itself over the wire. The only network call a wallet
// makes is `eth_sendRawTransaction`, carrying an ALREADY-SIGNED transaction.
// Since the wrapper's rewrite trick only works on the *unsigned* request
// (rewriting calldata after signing would invalidate the signature), a real
// wallet's signature will always cover the original, un-rewritten calldata —
// no RPC reconfiguration in the wallet can change that. See rpc-demo-app's
// git history for how this was discovered.
//
// This relay holds the real demo private key and completes the sign+broadcast
// step for `eth_sendTransaction` requests it receives (which, by the time they
// reach here, have already been rewritten by zama-json-rpc into the real
// confidential call) — the same role a custodian's own signing
// infrastructure would play sitting behind the wrapper in production.
// Everything else is forwarded unchanged to the real upstream RPC.
//
// Usage:
//   SIGNER_PK=0x... UPSTREAM_RPC_URL=https://... node scripts/signer-relay.mjs
import { createServer } from "node:http";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const RPC_URL = process.env.UPSTREAM_RPC_URL;
const PK = process.env.SIGNER_PK;
const PORT = Number(process.env.SIGNER_PORT ?? 8546);

if (!RPC_URL || !PK) {
  console.error(
    "Usage: SIGNER_PK=0x... UPSTREAM_RPC_URL=https://... node scripts/signer-relay.mjs",
  );
  process.exit(1);
}

const account = privateKeyToAccount(PK);
const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });

console.log(`Signer relay account: ${account.address}`);
console.log(`Forwarding everything else to: ${RPC_URL}`);

function sendJsonRpcError(res, id, code, message) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }));
}

const server = createServer((req, res) => {
  // This relay holds a real private key and must never be reachable from a
  // browser tab — a same-origin-policy-exempt "simple" fetch/POST can't read
  // the response, but that doesn't stop it from being signed and broadcast.
  if (req.headers.origin) {
    console.error(`Rejected request with browser Origin header: ${req.headers.origin}`);
    sendJsonRpcError(res, null, -32000, "signer-relay does not accept browser-originated requests");
    return;
  }

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error) {
      console.error(`Malformed JSON body: ${String(error?.message ?? error)}`);
      sendJsonRpcError(res, null, -32700, "Parse error");
      return;
    }

    try {
      if (body.method === "eth_sendTransaction") {
        const tx = body.params[0];
        if (!tx.from || tx.from.toLowerCase() !== account.address.toLowerCase()) {
          throw new Error(
            `signer-relay only signs for ${account.address}, got from=${tx.from ?? "(missing)"} — ` +
              "point the demo wallet at the same key this relay uses.",
          );
        }
        const hash = await walletClient.sendTransaction({
          to: tx.to,
          data: tx.data,
          gas: tx.gas ? BigInt(tx.gas) : undefined,
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: hash }));
        return;
      }

      const upstream = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await upstream.json();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    } catch (error) {
      console.error(`Request failed (method=${body.method}): ${String(error?.message ?? error)}`);
      sendJsonRpcError(res, body.id, -32000, String(error?.message ?? error));
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Signer relay listening on http://127.0.0.1:${PORT}`);
});
