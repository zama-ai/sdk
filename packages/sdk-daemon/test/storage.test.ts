import { chmod, mkdtemp, readdir, stat, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { status } from "@grpc/grpc-js";
import { afterEach, expect, test, vi } from "vitest";
import { serviceError } from "../src/errors.js";
import { CredentialStorage } from "../src/storage.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "daemon-storage-"));
  directories.push(path);
  return path;
}

async function openFailure(path: string) {
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    const error = await CredentialStorage.open(path).catch((error: unknown) => error);
    return { error: serviceError(error), stderr: stderr.mock.calls.map(([line]) => line) };
  } finally {
    stderr.mockRestore();
  }
}

test("persists typed credentials across reopen with private files", async () => {
  const path = await directory();
  const storage = await CredentialStorage.open(path);
  const value = { amount: 1n, bytes: new Uint8Array([1, 2]), secret: "test" };
  await storage.set("../../escape", value);
  await storage.close();
  const reopened = await CredentialStorage.open(path);
  expect(await reopened.get("../../escape")).toEqual(value);
  for (const file of await readdir(path)) {
    expect((await stat(join(path, file))).mode & 0o077).toBe(0);
  }
  await reopened.delete("../../escape");
  expect(await reopened.get("../../escape")).toBeNull();
  await reopened.close();
});

test("refuses a second process and retains failures even when callers catch them", async () => {
  const path = await directory();
  const storage = await CredentialStorage.open(path);
  const { error, stderr } = await openFailure(path);
  expect(error.code).toBe(status.FAILED_PRECONDITION);
  expect(error.details).toBe("Credential storage could not be opened.");
  expect(error.metadata.get("zama-error-code")).toEqual(["STORAGE_OPEN_FAILED"]);
  expect(stderr).toEqual(["[zama-daemon] STORAGE_OPEN_FAILED (details omitted)\n"]);
  await expect(storage.set("key", () => {})).rejects.toMatchObject({ code: "STORAGE_FAILED" });
  expect(() => storage.assertHealthy()).toThrow("Credential storage failed");
  await storage.close();
});

test.each([
  [
    "a shared storage directory",
    (path: string) => chmod(path, 0o755),
    "Storage directory must be private to its owner.",
  ],
  [
    "a shared credential file",
    (path: string) => writeFile(join(path, "credentials.sqlite"), "", { mode: 0o644 }),
    "Credential file must be private to its owner.",
  ],
])("rejects %s as a failed precondition", async (_, prepare, message) => {
  const path = await directory();
  await prepare(path);
  const { error, stderr } = await openFailure(path);
  expect(error.code).toBe(status.FAILED_PRECONDITION);
  expect(error.details).toBe(message);
  expect(error.metadata.get("zama-error-code")).toEqual(["STORAGE_NOT_PRIVATE"]);
  expect(stderr).toEqual(["[zama-daemon] STORAGE_NOT_PRIVATE (details omitted)\n"]);
});

test.skipIf(process.getuid?.() === 0)(
  "reports an unwritable storage parent as an open failure without details",
  async () => {
    const parent = await directory();
    await chmod(parent, 0o500);
    try {
      const { error, stderr } = await openFailure(join(parent, "store"));
      expect(error.code).toBe(status.FAILED_PRECONDITION);
      expect(error.metadata.get("zama-error-code")).toEqual(["STORAGE_OPEN_FAILED"]);
      expect(stderr).toEqual(["[zama-daemon] STORAGE_OPEN_FAILED (details omitted)\n"]);
    } finally {
      await chmod(parent, 0o700);
    }
  },
);
