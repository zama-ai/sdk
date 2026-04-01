/**
 * Integration tests: verify @fhevm/sdk node worker against the Sepolia relayer.
 *
 * These tests hit the live Sepolia relayer (https://relayer.testnet.zama.org)
 * and exercise the full WASM pipeline: init, encrypt, keypair, EIP-712.
 *
 * Prerequisites:
 *   pnpm build:sdk   (the node worker thread loads the built .js file)
 *
 * Run:
 *   pnpm test:integration -- --testPathPattern sepolia
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SepoliaConfig } from "../../relayer/relayer-utils";
import { NodeWorkerClient } from "../worker.node-client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILT_WORKER = resolve(__dirname, "../../../dist/esm/node/relayer-sdk.node-worker.js");

/** Subclass that resolves the worker from the built dist output. */
class TestNodeWorkerClient extends NodeWorkerClient {
  protected override createWorker(): Worker {
    return new Worker(BUILT_WORKER);
  }
}

const CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000001" as const;
const USER_ADDRESS = "0x0000000000000000000000000000000000000002" as const;

const NETWORK_TIMEOUT = 120_000;

describe("Sepolia @fhevm/sdk integration", () => {
  let worker: TestNodeWorkerClient;

  beforeAll(async () => {
    worker = new TestNodeWorkerClient({
      fhevmConfig: SepoliaConfig,
    });
    await worker.initWorker();
  }, NETWORK_TIMEOUT);

  afterAll(() => {
    worker.terminate();
  });

  it(
    "fetches FHE public key from relayer",
    async () => {
      const result = await worker.getPublicKey();

      expect(result.result).not.toBeNull();
      expect(result.result!.publicKeyId).toBe("fhe-encryption-key");
      expect(result.result!.publicKey).toBeInstanceOf(Uint8Array);
      expect(result.result!.publicKey.length).toBeGreaterThan(0);
    },
    NETWORK_TIMEOUT,
  );

  it("generates an E2E transport keypair", async () => {
    const result = await worker.generateKeypair();

    expect(result.publicKey).toMatch(/^0x/);
    expect(result.privateKey).toMatch(/^0x/);
    expect(result.publicKey.length).toBeGreaterThan(10);
    expect(result.privateKey.length).toBeGreaterThan(10);
  });

  it(
    "encrypts multiple typed values",
    async () => {
      const result = await worker.encrypt({
        values: [
          { type: "euint32", value: 42n },
          { type: "ebool", value: true },
          { type: "euint8", value: 7n },
        ],
        contractAddress: CONTRACT_ADDRESS,
        userAddress: USER_ADDRESS,
      });

      expect(result.handles).toHaveLength(3);
      for (const handle of result.handles) {
        expect(handle).toBeInstanceOf(Uint8Array);
        expect(handle.length).toBe(32);
      }
      expect(result.inputProof).toBeInstanceOf(Uint8Array);
      expect(result.inputProof.length).toBeGreaterThan(0);
    },
    NETWORK_TIMEOUT,
  );

  it(
    "encrypts a single bool value",
    async () => {
      const result = await worker.encrypt({
        values: [{ type: "ebool", value: false }],
        contractAddress: CONTRACT_ADDRESS,
        userAddress: USER_ADDRESS,
      });

      expect(result.handles).toHaveLength(1);
      expect(result.handles[0]).toBeInstanceOf(Uint8Array);
      expect(result.inputProof).toBeInstanceOf(Uint8Array);
    },
    NETWORK_TIMEOUT,
  );

  it(
    "encrypts an address value",
    async () => {
      const result = await worker.encrypt({
        values: [{ type: "eaddress", value: USER_ADDRESS }],
        contractAddress: CONTRACT_ADDRESS,
        userAddress: USER_ADDRESS,
      });

      expect(result.handles).toHaveLength(1);
      expect(result.inputProof).toBeInstanceOf(Uint8Array);
    },
    NETWORK_TIMEOUT,
  );

  it("creates EIP-712 user decrypt typed data", async () => {
    const keypair = await worker.generateKeypair();

    const result = await worker.createEIP712({
      publicKey: keypair.publicKey,
      contractAddresses: [CONTRACT_ADDRESS],
      startTimestamp: Math.floor(Date.now() / 1000),
      durationDays: 1,
    });

    expect(result.domain.name).toBe("Decryption");
    expect(result.domain.version).toBe("1");
    expect(result.domain.chainId).toBe(SepoliaConfig.chainId);
    expect(result.types.UserDecryptRequestVerification).toBeInstanceOf(Array);
    expect(result.types.UserDecryptRequestVerification.length).toBeGreaterThan(0);
    expect(result.message.publicKey).toBe(keypair.publicKey);
    expect(result.message.contractAddresses).toEqual([CONTRACT_ADDRESS]);
  });

  it("creates EIP-712 delegated user decrypt typed data", async () => {
    const keypair = await worker.generateKeypair();
    const delegatorAddress = "0x0000000000000000000000000000000000000099";

    const result = await worker.createDelegatedUserDecryptEIP712({
      publicKey: keypair.publicKey,
      contractAddresses: [CONTRACT_ADDRESS],
      delegatorAddress,
      startTimestamp: Math.floor(Date.now() / 1000),
      durationDays: 1,
    });

    expect(result).toHaveProperty("domain");
    expect(result).toHaveProperty("types");
    expect(result).toHaveProperty("message");
    expect(result).toHaveProperty("primaryType");
  });
});
