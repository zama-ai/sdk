import { syntheticEncryption } from "./support/encryption.js";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { encodeAbiParameters } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { expect, test, vi } from "vitest";
import type { GenericSigner } from "../../sdk/src/types/index.js";
import { getAppliedWireRuntime } from "../../sdk/src/relayer/applied-runtime.js";
import { sepolia } from "../../sdk/src/chains/index.js";
import { VALID_ENCRYPTED_VALUE, TOKEN } from "../../sdk/src/test-fixtures/constants.js";
import { createMockProvider } from "../../sdk/src/test-fixtures/provider.js";
import { createMockRelayer } from "../../sdk/src/test-fixtures/relayer.js";
import { createCoordinator } from "../src/coordination.js";
import { SidecarRuntime } from "../src/runtime.js";
import { createContextFactory } from "../src/sdk.js";
import { startServer } from "../src/server.js";
import { StorageManager } from "../src/storage-manager.js";

const forwarded = vi.hoisted(() => ({
  timeouts: [] as (number | undefined)[],
  relayers: [] as unknown[],
}));

vi.mock("@zama-fhe/sdk/viem", () => ({
  ViemProvider: vi.fn(function ({
    publicClient,
  }: {
    publicClient: { transport: { timeout?: number } };
  }) {
    forwarded.timeouts.push(publicClient.transport.timeout);
    return createMockProvider({ getChainId: vi.fn().mockResolvedValue(11155111) });
  }),
}));
vi.mock("@zama-fhe/sdk/node", () => ({
  node: (options: unknown) => {
    forwarded.relayers.push(options);
    return {
      type: "test",
      createRelayer: () => {
        const relayer = createMockRelayer({ chain: sepolia });
        const sign = relayer.signDecryptionPermit;
        return createMockRelayer({
          chain: sepolia,
          encryptValues: syntheticEncryption(""),
          signDecryptionPermit: (params) =>
            sign({
              ...params,
              signer: {
                ...(params.signer as GenericSigner),
                signTypedData: (data: Parameters<GenericSigner["signTypedData"]>[0]) =>
                  (params.signer as GenericSigner).signTypedData({
                    ...data,
                    types: {
                      EIP712Domain: [
                        { name: "name", type: "string" },
                        { name: "version", type: "string" },
                        { name: "chainId", type: "uint256" },
                        { name: "verifyingContract", type: "address" },
                      ],
                      UserDecryptRequestVerification: [
                        { name: "publicKey", type: "bytes" },
                        { name: "contractAddresses", type: "address[]" },
                        { name: "startTimestamp", type: "uint256" },
                        { name: "durationDays", type: "uint256" },
                        { name: "extraData", type: "bytes" },
                      ],
                    },
                  }),
              },
            }),
        });
      },
    };
  },
}));

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const execute = promisify(execFile);

test.skipIf(process.env.SIDECAR_NATIVE_TESTS !== "1")(
  "Go and Rust example entry points run their complete encryption and balance sequence with protected credentials",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-examples-"));
    const socket = join(directory, "sdk.sock");
    const privateKey = `0x${"01".repeat(32)}` as const;
    const secret = "fixture-example-synthetic-secret-".repeat(3);
    const account = privateKeyToAccount(privateKey);
    const methods: string[] = [];
    const rpc = createServer((request, response) => {
      const handle = async () => {
        let body = "";
        for await (const chunk of request) {
          body += String(chunk);
        }
        const reply = (call: {
          id: number;
          method: string;
          params?: { data?: string; input?: string }[];
        }) => {
          methods.push(call.method);
          const data = call.params?.[0]?.data ?? call.params?.[0]?.input;
          const result =
            call.method === "eth_chainId"
              ? "0xaa36a7"
              : call.method === "eth_call" && data?.startsWith("0x06fdde03")
                ? encodeAbiParameters([{ type: "string" }], ["Fixture Confidential Token"])
                : call.method === "eth_call"
                  ? VALID_ENCRYPTED_VALUE
                  : undefined;
          return result === undefined
            ? {
                jsonrpc: "2.0",
                id: call.id,
                error: { code: -32601, message: "unsupported fixture method" },
              }
            : { jsonrpc: "2.0", id: call.id, result };
        };
        const payload = JSON.parse(body);
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(Array.isArray(payload) ? payload.map(reply) : reply(payload)));
      };
      void handle().catch(() => {
        response.statusCode = 500;
        response.end("fixture request failed");
      });
    });
    const manager = new StorageManager();
    const runtime = new SidecarRuntime(createContextFactory(manager), createCoordinator());
    let stop: (() => Promise<void>) | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        rpc.once("error", reject);
        rpc.listen(0, "127.0.0.1", resolve);
      });
      const address = rpc.address();
      if (address === null || typeof address === "string") {
        throw new Error("missing fixture port");
      }
      const envFile = join(directory, ".env.sidecar.local");
      await writeFile(
        envFile,
        [
          `OWNER_ADDRESS=${account.address}`,
          `CONFIDENTIAL_TOKEN_ADDRESS=${TOKEN}`,
          `TEST_WALLET_PRIVATE_KEY=${privateKey}`,
          `SEPOLIA_RPC_URL=http://127.0.0.1:${address.port}`,
          `TRANSPORT_KEY_PAIR_DERIVATION_SECRET=${secret}`,
          "CREDENTIAL_STORAGE=application-memory",
          "SDK_SINGLE_THREAD=true",
          "SDK_BATCH_RPC_CALLS=false",
          "SDK_RPC_TIMEOUT_MS=5000",
        ].join("\n"),
        { mode: 0o600 },
      );
      const goExecutable = join(directory, "go-balance");
      await execute("go", ["build", "-o", goExecutable, "."], {
        cwd: join(repository, "clients/go/examples/balance"),
        env: process.env,
        timeout: 180_000,
      });
      await execute(
        "cargo",
        [
          "build",
          "--manifest-path",
          join(repository, "clients/rust/Cargo.toml"),
          "--example",
          "balance",
          "--features",
          "alloy",
          "--locked",
          "--target-dir",
          join(repository, "clients/rust/target"),
        ],
        { timeout: 180_000 },
      );
      stop = await startServer(runtime, socket, "test");
      for (const [executable, args] of [
        [goExecutable, [socket, envFile]],
        [join(repository, "clients/rust/target/debug/examples/balance"), []],
      ] as const) {
        const { stdout, stderr } = await execute(executable, [...args], {
          cwd: directory,
          env: { PATH: process.env.PATH, SIDECAR_SOCKET_PATH: socket },
          timeout: 30_000,
        });
        expect(stdout).toContain("Encrypted input");
        const proof = stdout.match(/Input proof: 0x([0-9a-f]+)/)?.[1];
        expect(proof).toBeDefined();
        expect(JSON.parse(Buffer.from(proof!, "hex").toString())).toEqual({
          values: [
            { type: "euint64", value: "1000" },
            { type: "ebool", value: true },
            { type: "eaddress", value: account.address },
          ],
          contractAddress: TOKEN,
          userAddress: account.address,
        });
        expect(stdout.indexOf("Input proof:")).toBeLessThan(stdout.indexOf("Encrypted balance:"));
        expect(stdout).toContain("Fixture Confidential Token");
        expect(stdout).toContain(`Encrypted balance: ${VALID_ENCRYPTED_VALUE}`);
        expect(stdout).toContain("Decrypted balance: 1000");
        expect(stdout + stderr).not.toContain(secret);
        expect(stdout + stderr).not.toContain(privateKey);
      }
      expect(forwarded.timeouts).toEqual([5000, 5000]);
      expect(forwarded.relayers).toEqual([{ batchRpcCalls: false }, { batchRpcCalls: false }]);
      expect(getAppliedWireRuntime()).toMatchObject({ singleThread: true });
      expect(methods.filter((method) => method === "eth_chainId")).toHaveLength(2);
      expect(methods.filter((method) => method === "eth_call")).toHaveLength(4);
    } finally {
      await runtime.close();
      await stop?.();
      await manager.close();
      await new Promise<void>((resolve) => rpc.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  },
  400_000,
);
