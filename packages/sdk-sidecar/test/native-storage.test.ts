import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vitest";
import { createContextFactory } from "../src/sdk.js";
import { createMockProvider } from "../../sdk/src/test-fixtures/provider.js";
import { createMockRelayer } from "../../sdk/src/test-fixtures/relayer.js";
import { createCoordinator } from "../src/coordination.js";
import { SidecarRuntime } from "../src/runtime.js";
import { StorageManager } from "../src/storage-manager.js";
import { startServer } from "../src/server.js";

vi.mock("@zama-fhe/sdk/viem", () => ({
  ViemProvider: vi.fn(function () {
    return createMockProvider();
  }),
}));
vi.mock("@zama-fhe/sdk/node", () => ({
  node: () => ({ type: "test", createRelayer: () => createMockRelayer() }),
}));

const repository = fileURLToPath(new URL("../../../", import.meta.url));

async function fixtureServer(socket: string) {
  const manager = new StorageManager();
  const runtime = new SidecarRuntime(createContextFactory(manager), createCoordinator());
  const stop = await startServer(runtime, socket, "test");
  return async () => {
    await runtime.close();
    await stop();
    await manager.close();
  };
}

test.skipIf(process.env.SIDECAR_NATIVE_TESTS !== "1").each([
  {
    name: "Go",
    command: "go",
    args: ["test", "-count=1", "-run", "^TestExternalStorageAcrossSidecarRestart$", "-v", "."],
    cwd: join(repository, "clients/go"),
  },
  {
    name: "Rust",
    command: "cargo",
    args: [
      "test",
      "--locked",
      "--test",
      "external_storage_restart",
      "--",
      "--ignored",
      "--nocapture",
    ],
    cwd: join(repository, "clients/rust"),
  },
])(
  "$name application storage survives replacement of the SDK runtime",
  async ({ command, args, cwd }) => {
    const directory = await mkdtemp(join(tmpdir(), "native-storage-"));
    const socket = join(directory, "sdk.sock");
    let executable = command;
    let argumentsToRun = args;
    if (command === "go") {
      executable = join(directory, "go-storage-test");
      await promisify(execFile)("go", ["test", "-c", "-o", executable, "."], { cwd });
      argumentsToRun = ["-test.run=^TestExternalStorageAcrossSidecarRestart$", "-test.v"];
    }
    let stop = await fixtureServer(socket);
    const child = spawn(executable, argumentsToRun, {
      cwd,
      env: { ...process.env, SIDECAR_STORAGE_TEST_SOCKET: socket },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    const ready = Promise.withResolvers<void>();
    const finished = new Promise<number | null>((resolve, reject) => {
      child.once("error", (error) => {
        ready.reject(error);
        reject(error);
      });
      child.once("exit", (code) => {
        ready.reject(new Error(`Native test exited before restart: ${output}`));
        resolve(code);
      });
    });
    void finished.catch(() => {});
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes("STORAGE_READY")) {
        ready.resolve();
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    const deadline = setTimeout(() => {
      ready.reject(new Error(`Native storage test timed out: ${output}`));
      child.kill();
    }, 90_000);
    try {
      await ready.promise;
      await stop();
      stop = await fixtureServer(socket);
      child.stdin.end("\n");
      const code = await finished;
      if (code !== 0) {
        throw new Error(`Native storage test failed: ${output}`);
      }
      expect(code).toBe(0);
      expect(output).toContain("STORAGE_REUSED");
    } finally {
      clearTimeout(deadline);
      child.kill();
      await stop();
      await rm(directory, { recursive: true, force: true });
    }
  },
  100_000,
);
