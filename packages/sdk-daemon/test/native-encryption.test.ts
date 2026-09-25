import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { EncryptInput } from "@zama-fhe/sdk";
import { getAddress } from "viem";
import { expect, test } from "vitest";
import { encryptionServer } from "./support/encryption.js";

const run = promisify(execFile);
const contractAddress = getAddress("0x1111111111111111111111111111111111111111");
const userAddress = getAddress("0x2222222222222222222222222222222222222222");
const expectedValues: EncryptInput[] = [
  { type: "euint256", value: (1n << 256n) - 1n },
  { type: "ebool", value: false },
  { type: "ebool", value: 1n },
  { type: "eaddress", value: userAddress },
  { type: "euint8", value: -1n },
  { type: "euint8", value: 42n },
  { type: "euint16", value: 42n },
  { type: "euint32", value: 42n },
  { type: "euint64", value: 42n },
  { type: "euint128", value: 42n },
];

function calls(
  fixtures: Awaited<ReturnType<typeof encryptionServer>>["fixtures"],
  scenario: string,
) {
  const matching = fixtures.filter((fixture) => fixture.scenario === scenario);
  expect(matching).toHaveLength(1);
  return matching[0]!.encryptValues.mock.calls.map(([params]) => params);
}

test.skipIf(process.env.ZAMA_SDK_DAEMON_NATIVE_TESTS !== "1").each([
  {
    name: "Go",
    command: "go",
    args: ["test", "-race", "-count=1", "-run", "^TestEncryptionSDKIntegration$", "-v", "."],
    directory: "go",
  },
  {
    name: "Rust",
    command: "cargo",
    args: [
      "test",
      "--locked",
      "--all-features",
      "--test",
      "encryption",
      "--",
      "--ignored",
      "--nocapture",
    ],
    directory: "rust",
  },
])(
  "$name encryption delegates through the real SDK",
  async ({ command, args, directory }) => {
    const server = await encryptionServer();
    try {
      const result = await run(command, args, {
        cwd: fileURLToPath(new URL(`../../../clients/${directory}/`, import.meta.url)),
        env: { ...process.env, ZAMA_SDK_DAEMON_ENCRYPT_TEST_SOCKET: server.socket },
        timeout: 180_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      expect(result.stdout).toMatch(/(PASS|test result: ok)/);
      const success = calls(server.fixtures, "");
      expect(success).toHaveLength(4);
      for (const params of success) {
        expect(params.values).toEqual(expectedValues);
        expect(params.contractAddress).toBe(contractAddress);
        expect(params.userAddress).toBe(userAddress);
      }
      expect(
        success.map((p) => (Object.hasOwn(p.options!, "timeout") ? p.options!.timeout : "default")),
      ).toEqual(["default", "default", 0, 500]);
      expect(calls(server.fixtures, "rate-limited")).toHaveLength(1);
      expect(calls(server.fixtures, "invalid-input")).toHaveLength(1);
      const cancelled = calls(server.fixtures, "cancelled");
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0]!.options!.signal!.aborted).toBe(true);
    } finally {
      await server.close();
    }
  },
  190_000,
);
