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

const server = createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (body.method === "eth_sendTransaction") {
      try {
        const tx = body.params[0];
        if (tx.from && tx.from.toLowerCase() !== account.address.toLowerCase()) {
          throw new Error(
            `signer-relay holds ${account.address}, but the request's "from" is ${tx.from} — ` +
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
      } catch (error) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            error: { code: -32000, message: String(error?.message ?? error) },
          }),
        );
      }
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
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Signer relay listening on http://127.0.0.1:${PORT}`);
});
