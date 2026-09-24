import { syntheticEncryption } from "./support/encryption.js";
import { createFakeChain } from "./support/fake-chain.js";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  encodeErrorResult,
  encodeFunctionData,
  parseTransaction,
  recoverTransactionAddress,
  serializeTransaction,
  toFunctionSelector,
  type Address,
  type EncodeFunctionDataParameters,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { expect, test, vi } from "vitest";
import type * as viemModule from "../../sdk/src/viem/index.js";
import type {
  ContractAbi,
  GenericSigner,
  WriteContractArgs,
  WriteContractConfig,
  WriteFunctionName,
} from "../../sdk/src/types/index.js";
import { getAppliedWireRuntime } from "../../sdk/src/relayer/applied-runtime.js";
import { sepolia } from "../../sdk/src/chains/index.js";
import { VALID_ENCRYPTED_VALUE, TOKEN } from "../../sdk/src/test-fixtures/constants.js";
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

vi.mock("@zama-fhe/sdk/viem", async (importOriginal) => {
  const actual = await importOriginal<typeof viemModule>();
  // Reads reach the fixture chain; only the offline preparation stays byte-for-byte fixed.
  class FixedPrepareViemProvider extends actual.ViemProvider {
    override async prepareTransaction<
      const TAbi extends ContractAbi,
      TFunctionName extends WriteFunctionName<TAbi>,
      const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
    >({
      calldata,
      nonce,
      gasLimit,
      fees,
    }: {
      from: Address;
      calldata: WriteContractConfig<TAbi, TFunctionName, TArgs>;
      nonce?: number;
      gasLimit?: bigint;
      fees?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
    }): Promise<Hex> {
      return serializeTransaction({
        type: "eip1559",
        chainId: 11155111,
        nonce: nonce ?? 0,
        gas: gasLimit ?? 100_000n,
        maxFeePerGas: fees?.maxFeePerGas ?? 2n,
        maxPriorityFeePerGas: fees?.maxPriorityFeePerGas ?? 1n,
        to: calldata.address,
        data: encodeFunctionData(calldata as EncodeFunctionDataParameters),
        value: 0n,
      });
    }
  }
  return {
    ...actual,
    ViemProvider: vi.fn(function (config: {
      publicClient: PublicClient & { transport: { timeout?: number } };
    }) {
      forwarded.timeouts.push(config.publicClient.transport.timeout);
      return new FixedPrepareViemProvider(config);
    }),
  };
});
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
const TOKEN_NAME = "Fixture Confidential Token";
// The examples default to this demo delegate when DELEGATE_ADDRESS is unset.
const DELEGATE = "0x2222222222222222222222222222222222222222";

// The SDK's aclAbi has no error entries, so the revert is decoded against a local fragment.
const ALREADY_DELEGATED_ABI = [
  {
    type: "error",
    name: "AlreadyDelegatedOrRevokedInSameBlock",
    inputs: [
      { name: "delegator", type: "address" },
      { name: "delegate", type: "address" },
      { name: "contractAddress", type: "address" },
      { name: "blockNumber", type: "uint256" },
    ],
  },
] as const;
const ALREADY_DELEGATED_SELECTOR = toFunctionSelector(
  "AlreadyDelegatedOrRevokedInSameBlock(address,address,address,uint256)",
);

function expectOrder(stdout: string, lines: string[]): void {
  let cursor = -1;
  for (const line of lines) {
    const index = stdout.indexOf(line, cursor + 1);
    expect(index, `missing after position ${cursor}: ${line}`).toBeGreaterThan(cursor);
    cursor = index;
  }
}

test.skipIf(process.env.SIDECAR_NATIVE_TESTS !== "1")(
  "Go and Rust example entry points encrypt inputs, decrypt a balance, prepare and sign offline, then grant and revoke an on-chain delegation with protected credentials",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-examples-"));
    const socket = join(directory, "sdk.sock");
    const privateKey = `0x${"01".repeat(32)}` as const;
    const secret = "fixture-example-synthetic-secret-".repeat(3);
    const account = privateKeyToAccount(privateKey);
    const chain = createFakeChain(TOKEN_NAME);
    const rpc = chain.server;
    const manager = new StorageManager();
    const runtime = new SidecarRuntime(createContextFactory(manager), createCoordinator());
    const attached = vi.spyOn(runtime, "attachEvents");
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
        const broadcastsBefore = chain.broadcasts.length;
        const startedAt = Math.floor(Date.now() / 1000);
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
        expect(stdout).toContain(TOKEN_NAME);
        expect(stdout).toContain(`Encrypted balance: ${VALID_ENCRYPTED_VALUE}`);
        expect(stdout).toContain("Decrypted balance: 1000");
        expect(stdout).toContain("Prepared transaction: SetOperator");
        expect(stdout).toContain("Signed transaction hash: 0x");
        const signed = stdout.match(/0x02[0-9a-f]{100,}/i)?.[0] as `0x02${string}` | undefined;
        if (signed === undefined) {
          throw new Error("example printed no signed EIP-1559 transaction");
        }
        expect(stdout.indexOf("Decrypted balance:")).toBeLessThan(stdout.indexOf(signed));
        expect(await recoverTransactionAddress({ serializedTransaction: signed })).toBe(
          account.address,
        );
        expect(parseTransaction(signed).chainId).toBe(11155111);

        const sent = chain.broadcasts.slice(broadcastsBefore);
        expect(sent).toHaveLength(2);
        expect(sent.map((entry) => entry.from)).toEqual([account.address, account.address]);
        const grant = sent[0]!;
        const revoke = sent[1]!;
        expect(grant.functionName).toBe("delegateForUserDecryption");
        expect(revoke.functionName).toBe("revokeDelegationForUserDecryption");
        for (const entry of sent) {
          expect(String(entry.args[0]).toLowerCase()).toBe(DELEGATE);
          expect(String(entry.args[1]).toLowerCase()).toBe(TOKEN.toLowerCase());
        }
        const expiry = grant.args[2] as bigint;
        expect(expiry).toBeGreaterThanOrEqual(BigInt(startedAt + 7_200 - 120));
        expect(expiry).toBeLessThanOrEqual(BigInt(Math.floor(Date.now() / 1000) + 7_200));
        // The demo revokes what it granted, so the next run starts from an inactive delegation.
        expect(chain.expiryOf(account.address, DELEGATE, TOKEN)).toBe(0n);

        expect(stdout.match(/Delegate: (0x[0-9a-fA-F]{40})/)?.[1]?.toLowerCase()).toBe(DELEGATE);
        expectOrder(stdout, [
          "Delegation before: inactive (expiry 0)",
          `Delegation granted: ${grant.hash}`,
          `Delegation after grant: active (expiry ${expiry})`,
          "Waiting for the next block before revoking.",
          `Delegation revoked: ${revoke.hash}`,
          "Delegation after revoke: inactive (expiry 0)",
        ]);
        expect(stdout + stderr).toContain("SDK event");
        expect(stdout + stderr).not.toContain(secret);
        expect(stdout + stderr).not.toContain(privateKey);
      }
      // Asserted here: the revert runs below reuse the same provider/relayer wiring.
      expect(forwarded.timeouts).toEqual([5000, 5000]);
      expect(forwarded.relayers).toEqual([{ batchRpcCalls: false }, { batchRpcCalls: false }]);
      expect(attached).toHaveBeenCalledTimes(2);

      // Round 2: a pre-broadcast revert on the grant must surface, not silently retry or hide.
      for (const [executable, args] of [
        [goExecutable, [socket, envFile]],
        [join(repository, "clients/rust/target/debug/examples/balance"), []],
      ] as const) {
        const broadcastsBefore = chain.broadcasts.length;
        chain.revertNextEstimate(
          encodeErrorResult({
            abi: ALREADY_DELEGATED_ABI,
            errorName: "AlreadyDelegatedOrRevokedInSameBlock",
            args: [account.address, DELEGATE, TOKEN, 1n],
          }),
        );
        const failure = await execute(executable, [...args], {
          cwd: directory,
          env: { PATH: process.env.PATH, SIDECAR_SOCKET_PATH: socket },
          timeout: 30_000,
        }).then(
          () => undefined,
          (rejection: unknown) => rejection as { code?: number; stdout: string; stderr: string },
        );
        expect(failure).toBeDefined();
        const { code, stdout, stderr } = failure!;
        expect(code).not.toBe(0);
        expect(stdout + stderr).toContain("TRANSACTION_REVERTED");
        expect(stdout + stderr).toContain(ALREADY_DELEGATED_SELECTOR);
        expect(chain.broadcasts.length).toBe(broadcastsBefore);
        expect(chain.expiryOf(account.address, DELEGATE, TOKEN)).toBe(0n);
        expect(stdout).toContain("Delegation before: inactive (expiry 0)");
        expect(stdout).not.toContain("Delegation granted");
      }

      expect(getAppliedWireRuntime()).toMatchObject({ singleThread: true });
      expect([...new Set(chain.unsupportedMethods)]).toEqual([]);
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
