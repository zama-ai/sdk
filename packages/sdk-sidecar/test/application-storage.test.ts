import { errorDetails } from "../src/errors.js";
import { FakeStream } from "./support/fake-stream.js";
import { frames } from "./support/frames.js";
import { expect, test, vi } from "vitest";
import { RemoteStorage, type StorageStream } from "../src/remote-storage.js";
import { StorageManager } from "../src/storage-manager.js";
import { decodeStorage, encodeStorage } from "../src/storage-codec.js";
import {
  StorageBinding,
  type StorageServerMessage,
} from "../src/generated/zama/sdk/v1alpha1/sidecar.js";

test("opaque payload preserves credential types and rejects unversioned or empty bytes", () => {
  const value = {
    n: 2n,
    bytes: new Uint8Array([1, 2]),
    empty: undefined,
    nil: null,
    map: new Map([["x", 1n]]),
  };
  expect(decodeStorage(encodeStorage(value))).toEqual(value);
  expect(() => decodeStorage(new Uint8Array())).toThrow("version");
});
test("memory choices are isolated while application backend identities are shared explicitly", async () => {
  const manager = new StorageManager();
  const remote = new RemoteStorage();
  const first = await manager.resolve(undefined, remote);
  const second = await manager.resolve(
    StorageBinding.fromPartial({ backend: { $case: "memory", memory: {} } }),
    remote,
  );
  await first.storage.set("key", 1n);
  expect(await second.storage.get("key")).toBeNull();
  expect(first.identity).not.toBe(second.identity);
  const app = StorageBinding.fromPartial({
    backend: { $case: "application", application: "shared-database" },
  });
  expect((await manager.resolve(app, remote)).identity).toBe(
    (await manager.resolve(app, new RemoteStorage())).identity,
  );
  await expect(
    manager.resolve(
      StorageBinding.fromPartial({ backend: { $case: "persistent", persistent: "store" } }),
      remote,
    ),
  ).rejects.toThrow("storage directory");
});
test("pre-attachment lifecycle calls queue and unknown replies leave other callbacks intact", async () => {
  const remote = new RemoteStorage();
  const storage = remote.forBackend("backend");
  const pending = storage.get("key");
  const stream = new FakeStream<StorageServerMessage>();
  remote.attach(stream as unknown as StorageStream);
  const action = frames(stream.messages, "action")[0]?.action;
  expect(action?.backendId).toBe("backend");
  remote.reply({ requestId: "unknown", value: undefined, error: undefined });
  expect(frames(stream.messages, "replyError").at(-1)?.replyError.error?.code).toBe(
    "STORAGE_REQUEST_NOT_FOUND",
  );
  remote.reply({
    requestId: action!.requestId,
    value: Buffer.from(encodeStorage(7n)),
    error: undefined,
  });
  await expect(pending).resolves.toBe(7n);
  remote.dispose();
});
test("absence differs from empty bytes and connection loss never becomes a cache miss", async () => {
  const remote = new RemoteStorage();
  const storage = remote.forBackend("backend");
  const stream = new FakeStream<StorageServerMessage>();
  remote.attach(stream as unknown as StorageStream);
  const missing = storage.get("missing");
  remote.reply({
    requestId: frames(stream.messages, "action").at(-1)!.action.requestId,
    value: undefined,
    error: undefined,
  });
  await expect(missing).resolves.toBeNull();
  const empty = storage.get("empty");
  remote.reply({
    requestId: frames(stream.messages, "action").at(-1)!.action.requestId,
    value: Buffer.alloc(0),
    error: undefined,
  });
  await expect(empty).rejects.toThrow("version");
  const lost = storage.get("lost");
  stream.emit("close");
  await expect(lost).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  await expect(storage.get("later")).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  const next = new FakeStream<StorageServerMessage>();
  remote.attach(next as unknown as StorageStream);
  expect(next.messages).toHaveLength(1);
  remote.dispose();
});
test("attachment waiting is bounded without timing out an attached storage callback", async () => {
  vi.useFakeTimers();
  try {
    const remote = new RemoteStorage();
    const pending = remote.forBackend("backend").get("key");
    const rejection = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await rejection).toMatchObject({ code: "STORAGE_ATTACH_TIMEOUT" });
    remote.dispose();
  } finally {
    vi.useRealTimers();
  }
});

test("application callback failures retain wire code and retry metadata", async () => {
  const remote = new RemoteStorage();
  const stream = new FakeStream<StorageServerMessage>();
  remote.attach(stream as unknown as StorageStream);
  const pending = remote
    .forBackend("backend")
    .get("key")
    .catch((error: unknown) => errorDetails(error));
  remote.reply({
    requestId: frames(stream.messages, "action").at(-1)!.action.requestId,
    value: undefined,
    error: {
      code: "STORAGE_FAILED",
      message: "backend unavailable",
      retryable: true,
      retryAfterSeconds: 2,
    },
  });
  expect(await pending).toEqual({
    code: "STORAGE_FAILED",
    message: "backend unavailable",
    retryable: true,
    retryAfterSeconds: 2,
  });
  remote.dispose();
});

test("a failed write detaches storage and permits a fresh attachment without replay", async () => {
  const remote = new RemoteStorage();
  const storage = remote.forBackend("backend");
  const broken = new FakeStream<StorageServerMessage>();
  remote.attach(broken as unknown as StorageStream);
  broken.write = () => {
    throw new Error("write failed");
  };
  await expect(storage.get("lost")).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  const next = new FakeStream<StorageServerMessage>();
  remote.attach(next as unknown as StorageStream);
  broken.emit("error", new Error("late failure"));
  const pending = storage.get("new");
  expect(frames(next.messages, "action")).toHaveLength(1);
  remote.reply({
    requestId: frames(next.messages, "action")[0]!.action.requestId,
    value: undefined,
    error: undefined,
  });
  await expect(pending).resolves.toBeNull();
  remote.dispose();
});
