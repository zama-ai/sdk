import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { encryptionServer } from "./support/encryption.js";

const run = promisify(execFile);
test.skipIf(process.env.SIDECAR_NATIVE_TESTS !== "1").each([
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
        env: { ...process.env, SIDECAR_ENCRYPT_TEST_SOCKET: server.socket },
        timeout: 180_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      expect(result.stdout).toMatch(/(PASS|test result: ok)/);
      expect(server.fixtures.length).toBeGreaterThan(0);
      expect(
        server.fixtures.some(({ encryptValues }) => encryptValues.mock.calls.length >= 4),
      ).toBe(true);
    } finally {
      await server.close();
    }
  },
  190_000,
);
