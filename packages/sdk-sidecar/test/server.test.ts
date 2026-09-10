import type * as FileSystem from "node:fs/promises";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { credentials, Metadata, status, type ServiceError } from "@grpc/grpc-js";
import { expect, test, vi } from "vitest";
import { SidecarServiceClient } from "../src/generated/zama/sdk/v1alpha1/sidecar.js";
import { createCoordinator } from "../src/coordination.js";
import { SidecarRuntime, type ContextSdk } from "../src/runtime.js";
import { startServer } from "../src/server.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return { ...actual, chmod: vi.fn(actual.chmod) };
});

test("serves typed unary calls over a private socket and sanitizes errors", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sidecar-socket-"));
  const socketPath = join(directory, "sdk.sock");
  const runtime = new SidecarRuntime(
    async () => ({
      storageIdentities: ["shared-fixture"],
      sdk: {
        offline: {
          preparePermit: async () => {
            throw new Error("private-secret");
          },
        },
        dispose: () => {},
      } as unknown as ContextSdk,
    }),
    createCoordinator(),
  );
  const stop = await startServer(runtime, socketPath, "test-version");
  const client = new SidecarServiceClient(`unix:${socketPath}`, credentials.createInsecure());
  try {
    expect((await stat(socketPath)).mode & 0o077).toBe(0);
    const info = await new Promise<{ sdkVersion: string }>((resolve, reject) =>
      client.getInfo({}, (error, response) => (error ? reject(error) : resolve(response))),
    );
    expect(info.sdkVersion).toBe("test-version");
    const created = await new Promise<{ contextId: string }>((resolve, reject) =>
      client.createContext(
        {
          storage: undefined,
          permitStorage: undefined,
          configJson: "{}",
          signerEnabled: false,
          account: undefined,
        },
        (error, response) => (error ? reject(error) : resolve(response)),
      ),
    );
    const error = await new Promise<ServiceError>((resolve, reject) =>
      client.preparePermit(
        {
          operation: { contextId: created.contextId, operationId: "prepare" },
          signerAddress: Buffer.alloc(20, 1),
          contractAddresses: [Buffer.alloc(20, 2)],
          durationDays: 1,
          delegatorAddress: undefined,
        },
        (error) => (error ? resolve(error) : reject(new Error("Expected error"))),
      ),
    );
    expect(error.code).toBe(status.INTERNAL);
    expect(error.details).not.toContain("private-secret");
    expect(error.metadata.get("zama-error-code")).toEqual(["INTERNAL"]);
    await expect(startServer(runtime, socketPath, "test")).rejects.toThrow(
      "Socket path already exists",
    );
  } finally {
    client.close();
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test("closes the bound listener if socket permissions cannot be applied", async () => {
  const filesystem = await import("node:fs/promises");
  const directory = await mkdtemp(join(tmpdir(), "sidecar-bind-fail-"));
  const socket = join(directory, "sdk.sock");
  const runtime = new SidecarRuntime(async () => {
    throw new Error("unused");
  }, createCoordinator());
  const chmod = vi.mocked(filesystem.chmod).mockRejectedValueOnce(new Error("chmod failed"));
  try {
    await expect(startServer(runtime, socket, "test")).rejects.toThrow("chmod failed");
    chmod.mockImplementation((await vi.importActual<typeof FileSystem>("node:fs/promises")).chmod);
    const stop = await startServer(runtime, socket, "test");
    await stop();
  } finally {
    chmod.mockReset();
    await rm(directory, { recursive: true, force: true });
  }
});

test.each(["cancel", "deadline"] as const)(
  "forwards gRPC %s to SDK decryption signal",
  async (mode) => {
    const filesystem = await import("node:fs/promises");
    vi.mocked(filesystem.chmod).mockImplementation(
      (await vi.importActual<typeof FileSystem>("node:fs/promises")).chmod,
    );
    const directory = await mkdtemp(join(tmpdir(), "sidecar-cancel-"));
    const socket = join(directory, "sdk.sock");
    const entered = Promise.withResolvers<void>();
    const aborted = Promise.withResolvers<void>();
    const completion = Promise.withResolvers<Record<`0x${string}`, bigint>>();
    const runtime = new SidecarRuntime(
      async () => ({
        storageIdentities: ["shared-fixture"],
        sdk: {
          decryption: {
            decryptValues: async (_: unknown, options: { signal: AbortSignal }) => {
              options.signal.addEventListener("abort", () => aborted.resolve(), { once: true });
              entered.resolve();
              return completion.promise;
            },
          },
          dispose: () => {},
        } as unknown as ContextSdk,
      }),
      createCoordinator(),
    );
    const contextId = await runtime.createContext({
      storage: undefined,
      permitStorage: undefined,
      configJson: "{}",
      signerEnabled: false,
      account: undefined,
    });
    const stop = await startServer(runtime, socket, "test");
    const client = new SidecarServiceClient(`unix:${socket}`, credentials.createInsecure());
    try {
      const response = Promise.withResolvers<ServiceError | null>();
      const call = client.decryptValues(
        { operation: { contextId, operationId: "decrypt" }, inputs: [], timeoutMs: undefined },
        new Metadata(),
        { deadline: Date.now() + (mode === "deadline" ? 100 : 5000) },
        (error) => response.resolve(error),
      );
      await entered.promise;
      if (mode === "cancel") {
        call.cancel();
      }
      expect((await response.promise)?.code).toBe(
        mode === "cancel" ? status.CANCELLED : status.DEADLINE_EXCEEDED,
      );
      await aborted.promise;
      completion.resolve({});
      await runtime.waitUntilIdle();
    } finally {
      completion.resolve({});
      client.close();
      await runtime.close();
      await stop();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("closing contexts with both callback channels permits prompt server shutdown", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sidecar-duplex-close-"));
  const socket = join(directory, "sdk.sock");
  const runtime = new SidecarRuntime(
    async () => ({
      storageIdentities: ["shared-fixture"],
      sdk: { dispose: () => {} } as unknown as ContextSdk,
    }),
    createCoordinator(),
  );
  const stop = await startServer(runtime, socket, "test");
  const client = new SidecarServiceClient(`unix:${socket}`, credentials.createInsecure());
  try {
    const created = await new Promise<{ contextId: string }>((resolve, reject) =>
      client.createContext(
        {
          configJson: "{}",
          signerEnabled: true,
          account: undefined,
          storage: undefined,
          permitStorage: undefined,
        },
        (error, value) => (error ? reject(error) : resolve(value)),
      ),
    );
    const signer = client.signerChannel();
    const storage = client.storageChannel();
    signer.on("error", () => {});
    storage.on("error", () => {});
    const attached = Promise.all([
      new Promise<void>((resolve) => signer.once("data", () => resolve())),
      new Promise<void>((resolve) => storage.once("data", () => resolve())),
    ]);
    signer.write({ message: { $case: "attach", attach: created } });
    storage.write({ message: { $case: "attach", attach: created } });
    await attached;
    await new Promise<void>((resolve, reject) =>
      client.closeContext(created, (error) => (error ? reject(error) : resolve())),
    );
    client.close();
    await runtime.close();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const started = Date.now();
    await stop();
    expect(Date.now() - started).toBeLessThan(1000);
  } finally {
    client.close();
    await runtime.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 5000);
