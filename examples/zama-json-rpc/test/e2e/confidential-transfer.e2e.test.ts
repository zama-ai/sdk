import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { decodeFunctionData, encodeFunctionData, parseAbi } from "viem";
import { sepolia } from "@zama-fhe/sdk/chains";
import { createSdk } from "../../src/sdk.js";
import { ConfidentialOperationRegistry } from "../../src/registry/index.js";
import { confidentialTransferOperation } from "../../src/registry/operations/confidential-transfer.js";
import { createLogger } from "../../src/logging/logger.js";
import { createUpstreamForwarder } from "../../src/rpc/passthrough.js";
import { buildZamaHandlers } from "../../src/zama/introspection.js";
import { createHttpServer } from "../../src/server.js";

/**
 * Real end-to-end test: hits the real Sepolia relayer/KMS via `sdk.encrypt()`
 * — no mocking of the one genuinely novel, unverified piece of this POC.
 *
 * The upstream RPC is a local echo stub, not a real signer-capable node: this
 * wrapper's rewrite only ever needs a "from" address string (never its
 * private key — see src/sdk.ts), so no funded account or Foundry/anvil is
 * required to prove the encrypt+rewrite pipeline is correct. What this
 * deliberately does NOT prove is a real broadcast to a signer sitting behind
 * the wrapper — see WALKTHROUGH.md ("known limitations") for why that needs
 * a positioned custodian/signer this POC doesn't have access to.
 */
const CHAIN_ID = 11155111;
const TOKEN = (process.env.CONFIDENTIAL_TOKEN_ADDRESS ??
  "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639") as `0x${string}`;
const SEPOLIA_RPC_URL =
  process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const FROM = (process.env.SENDER_ADDRESS ??
  "0x1111111111111111111111111111111111111111") as `0x${string}`;
const TO = "0x2222222222222222222222222222222222222222" as const;

const realConfidentialTransferAbi = parseAbi([
  "function confidentialTransfer(address to, bytes32 encryptedAmount, bytes inputProof) returns (bytes32)",
]);

function startEchoUpstream(): Promise<{
  url: string;
  close: () => Promise<void>;
  lastRequest: () => { params: [{ data: `0x${string}` }] } | undefined;
}> {
  let last: { params: [{ data: `0x${string}` }] } | undefined;
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        id: number;
        params: [{ data: `0x${string}` }];
      };
      last = parsed;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: parsed.id, result: "0xecho" }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/`,
        close: () => new Promise((r) => server.close(() => r())),
        lastRequest: () => last,
      });
    });
  });
}

describe("zama-json-rpc e2e — real Sepolia relayer", () => {
  let echo: Awaited<ReturnType<typeof startEchoUpstream>>;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    echo = await startEchoUpstream();

    const sdk = createSdk({
      rpcUrl: SEPOLIA_RPC_URL,
      chainId: CHAIN_ID,
      host: "127.0.0.1",
      port: 0,
      httpPath: "/",
      confidentialTokenAddress: TOKEN,
      relayerApiKey: process.env.RELAYER_API_KEY,
      verbose: false,
      quiet: true,
    });
    const registry = new ConfidentialOperationRegistry([
      confidentialTransferOperation({ chainId: CHAIN_ID, tokenAddress: TOKEN }),
    ]);
    const logger = createLogger({ quiet: true, verbose: false });

    server = createHttpServer({
      routerDeps: {
        sdk,
        registry,
        chainId: CHAIN_ID,
        logger,
        forwardToUpstream: createUpstreamForwarder(echo.url),
        zamaHandlers: buildZamaHandlers({ registry, chain: sepolia }),
      },
      httpPath: "/",
      logger,
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await echo.close();
  });

  it("encrypts a real amount via the Sepolia relayer and forwards a valid confidentialTransfer call", async () => {
    const operation = confidentialTransferOperation({ chainId: CHAIN_ID, tokenAddress: TOKEN });
    const plaintextData = encodeFunctionData({
      abi: operation.publicAbi,
      functionName: "transfer",
      args: [TO, 1n],
    });

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendTransaction",
        params: [{ from: FROM, to: TOKEN, data: plaintextData }],
      }),
    });
    const body = (await response.json()) as { result?: string };
    expect(body.result).toBe("0xecho");

    const forwarded = echo.lastRequest();
    const forwardedData = forwarded?.params[0].data;
    expect(forwardedData).toBeDefined();
    expect(forwardedData).not.toBe(plaintextData);

    const decoded = decodeFunctionData({ abi: realConfidentialTransferAbi, data: forwardedData! });
    expect(decoded.functionName).toBe("confidentialTransfer");
    expect(decoded.args[0]).toBe(TO);
    // A real ciphertext handle (bytes32) and a real ZK input proof, both
    // produced by the actual Sepolia relayer/KMS — not fixtures.
    expect(decoded.args[1]).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(decoded.args[2]).toMatch(/^0x[0-9a-fA-F]+$/);
  }, 60_000);
});
