import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import { fixture, testServer } from "./support/harness.js";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const execute = promisify(execFile);

test.skipIf(process.env.SIDECAR_NATIVE_TESTS !== "1")(
  "Go immediately resubscribes after closing an event stream against the real sidecar",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-events-"));
    let server: Awaited<ReturnType<typeof testServer>> | undefined;
    const executable = join(directory, "go-events-test");
    try {
      server = await testServer(async () => ({
        sdk: fixture(undefined).sdk,
        storageIdentities: [],
      }));
      await execute("go", ["test", "-c", "-o", executable, "."], {
        cwd: join(repository, "clients/go"),
        timeout: 180_000,
      });
      const { stdout } = await execute(
        executable,
        ["-test.run=^TestEventResubscribeAcrossRealSidecar$", "-test.v"],
        {
          cwd: join(repository, "clients/go"),
          env: { ...process.env, SIDECAR_EVENT_RESUBSCRIBE_SOCKET: server.socket },
          timeout: 30_000,
        },
      ).catch((error: unknown) => {
        const failure = error as Error & { stdout?: string; stderr?: string };
        throw new Error(`${failure.message}\n${failure.stdout ?? ""}\n${failure.stderr ?? ""}`);
      });
      expect(stdout).toContain("--- PASS: TestEventResubscribeAcrossRealSidecar");
    } finally {
      try {
        await server?.close();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  },
  240_000,
);
