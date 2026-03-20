/**
 * Mock relayer HTTP server for Node.js e2e tests.
 *
 * Implements the relayer V2 async API so the real @zama-fhe/relayer-sdk WASM
 * worker can initialize and operate against it. Uses RelayerCleartext under
 * the hood for FHE operations against the local anvil.
 */
import { createServer, type Server, type ServerResponse, type IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import { RelayerCleartext } from "@zama-fhe/sdk/cleartext";
import { hardhatCleartextConfig } from "@zama-fhe/sdk/cleartext";
import { toHex, type Address, type Hex } from "viem";
import { SepoliaConfig } from "@zama-fhe/sdk";

// Resolved jobs: jobId → result
const jobs = new Map<string, { status: string; result: unknown }>();

let relayer: RelayerCleartext;

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => resolve(data));
  });
}

/** Testnet relayer URL — used to proxy /keyurl so the WASM gets real FHE public keys and CRS. */
const TESTNET_RELAYER_URL = SepoliaConfig.relayerUrl;

export async function startMockRelayerServer(
  anvilPort: number,
  listenPort = 0,
): Promise<{ server: Server; port: number; url: string }> {
  relayer = new RelayerCleartext({
    ...hardhatCleartextConfig,
    network: `http://127.0.0.1:${anvilPort}`,
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://127.0.0.1`);
    const path = url.pathname;
    const method = req.method;

    try {
      // ── Initialization: proxy /keyurl to the real testnet relayer ──
      // The WASM SDK needs valid FHE public keys and CRS to initialize.
      // We fetch these from the testnet relayer but mock all operation endpoints.
      if (method === "GET" && path === "/keyurl") {
        const upstream = await fetch(`${TESTNET_RELAYER_URL}/keyurl`, {
          headers: {
            "ZAMA-SDK-VERSION": (req.headers["zama-sdk-version"] as string) ?? "",
            "ZAMA-SDK-NAME": (req.headers["zama-sdk-name"] as string) ?? "",
          },
        });
        const body = await upstream.text();
        res.writeHead(upstream.status, { "Content-Type": "application/json" });
        res.end(body);
        return;
      }

      // ── V2 Async: POST submits job, GET polls ──

      // Input proof (encrypt)
      if (method === "POST" && path === "/input-proof") {
        const body = JSON.parse(await readBody(req));
        const jobId = randomUUID();

        // Process immediately using RelayerCleartext
        try {
          const result = await relayer.encrypt({
            contractAddress: body.contractAddress as Address,
            userAddress: body.userAddress as Address,
            values: [{ type: "euint64", value: 0n }], // Mock: we don't have the actual values
          });

          jobs.set(jobId, {
            status: "succeeded",
            result: {
              accepted: true,
              handles: result.handles.map((h) => toHex(h)),
              signatures: ["0x" + "00".repeat(65)],
              extraData: "0x",
            },
          });
        } catch {
          jobs.set(jobId, {
            status: "succeeded",
            result: { accepted: false, extraData: "0x" },
          });
        }

        json(res, 202, {
          status: "queued",
          requestId: randomUUID(),
          result: { jobId },
        });
        return;
      }

      if (method === "GET" && path.startsWith("/input-proof/")) {
        const jobId = path.split("/input-proof/")[1];
        const job = jobs.get(jobId!);
        if (!job) {
          json(res, 404, {
            error: { code: "not_found", message: "Job not found" },
          });
          return;
        }
        json(res, 200, {
          status: job.status,
          requestId: randomUUID(),
          result: job.result,
        });
        return;
      }

      // User decrypt
      if (method === "POST" && path === "/user-decrypt") {
        const body = JSON.parse(await readBody(req));
        const jobId = randomUUID();

        try {
          const handles = body.handleContractPairs.map((p: any) => p.handle as Hex);
          const contractAddress = body.handleContractPairs[0]?.contractAddress as Address;

          const clearValues = await relayer.userDecrypt({
            handles,
            contractAddress,
            signedContractAddresses: body.contractAddresses,
            privateKey: "0x" as Hex,
            publicKey: "0x" as Hex,
            signature: ("0x" + body.signature) as Hex,
            signerAddress: body.userAddress as Address,
            startTimestamp: Number(body.requestValidity?.startTimestamp ?? 0),
            durationDays: Number(body.requestValidity?.durationDays ?? 7),
          });

          const resultArray = handles.map((handle: Address) => ({
            payload: (clearValues[handle] ?? 0n).toString(16).padStart(64, "0"),
            signature: "00".repeat(65),
          }));

          jobs.set(jobId, {
            status: "succeeded",
            result: { result: resultArray },
          });
        } catch {
          jobs.set(jobId, { status: "succeeded", result: { result: [] } });
        }

        json(res, 202, {
          status: "queued",
          requestId: randomUUID(),
          result: { jobId },
        });
        return;
      }

      if (method === "GET" && path.startsWith("/user-decrypt/")) {
        const jobId = path.split("/user-decrypt/")[1];
        const job = jobs.get(jobId!);
        if (!job) {
          json(res, 404, {
            error: { code: "not_found", message: "Job not found" },
          });
          return;
        }
        json(res, 200, {
          status: job.status,
          requestId: randomUUID(),
          result: job.result,
        });
        return;
      }

      // Public decrypt
      if (method === "POST" && path === "/public-decrypt") {
        const body = JSON.parse(await readBody(req));
        const jobId = randomUUID();

        try {
          const pdResult = await relayer.publicDecrypt(body.ciphertextHandles as Hex[]);
          const firstHandle = body.ciphertextHandles[0] as Hex;
          const decryptedValue = (pdResult.clearValues[firstHandle] ?? 0n)
            .toString(16)
            .padStart(64, "0");

          jobs.set(jobId, {
            status: "succeeded",
            result: {
              signatures: ["00".repeat(65)],
              decryptedValue,
              extraData: "0x",
            },
          });
        } catch {
          jobs.set(jobId, {
            status: "succeeded",
            result: {
              signatures: [],
              decryptedValue: "0".repeat(64),
              extraData: "0x",
            },
          });
        }

        json(res, 202, {
          status: "queued",
          requestId: randomUUID(),
          result: { jobId },
        });
        return;
      }

      if (method === "GET" && path.startsWith("/public-decrypt/")) {
        const jobId = path.split("/public-decrypt/")[1];
        const job = jobs.get(jobId!);
        if (!job) {
          json(res, 404, {
            error: { code: "not_found", message: "Job not found" },
          });
          return;
        }
        json(res, 200, {
          status: job.status,
          requestId: randomUUID(),
          result: job.result,
        });
        return;
      }

      // Delegated user decrypt
      if (method === "POST" && path === "/delegated-user-decrypt") {
        const body = JSON.parse(await readBody(req));
        const jobId = randomUUID();

        try {
          const handles = body.handleContractPairs.map((p: any) => p.handle as Hex);
          const contractAddress = body.handleContractPairs[0]?.contractAddress as Address;

          const clearValues = await relayer.delegatedUserDecrypt({
            handles,
            contractAddress,
            signedContractAddresses: body.contractAddresses,
            privateKey: "0x" as Hex,
            publicKey: "0x" as Hex,
            signature: ("0x" + body.signature) as Hex,
            delegatorAddress: body.delegatorAddress as Address,
            delegateAddress: body.delegateAddress as Address,
            startTimestamp: Number(body.startTimestamp ?? 0),
            durationDays: Number(body.durationDays ?? 7),
          });

          const resultArray = handles.map((handle: Address) => ({
            payload: (clearValues[handle] ?? 0n).toString(16).padStart(64, "0"),
            signature: "00".repeat(65),
          }));

          jobs.set(jobId, {
            status: "succeeded",
            result: { result: resultArray },
          });
        } catch {
          jobs.set(jobId, { status: "succeeded", result: { result: [] } });
        }

        json(res, 202, {
          status: "queued",
          requestId: randomUUID(),
          result: { jobId },
        });
        return;
      }

      if (method === "GET" && path.startsWith("/delegated-user-decrypt/")) {
        const jobId = path.split("/delegated-user-decrypt/")[1];
        const job = jobs.get(jobId!);
        if (!job) {
          json(res, 404, {
            error: { code: "not_found", message: "Job not found" },
          });
          return;
        }
        json(res, 200, {
          status: job.status,
          requestId: randomUUID(),
          result: job.result,
        });
        return;
      }

      // Fallback
      json(res, 404, {
        error: {
          code: "not_found",
          message: `Unknown endpoint: ${method} ${path}`,
        },
      });
    } catch (error) {
      console.error("[MockRelayer]", method, path, error);
      json(res, 500, { error: { code: "internal", message: String(error) } });
    }
  });

  return new Promise((resolve) => {
    server.listen(listenPort, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      const url = `http://127.0.0.1:${addr.port}`;
      console.log(`[MockRelayer] Listening on ${url}`);
      resolve({ server, port: addr.port, url });
    });
  });
}
