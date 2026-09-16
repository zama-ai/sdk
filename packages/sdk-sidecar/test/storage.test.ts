import { mkdtemp, readdir, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test } from "vitest";
import { CredentialStorage } from "../src/storage.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "sidecar-storage-"));
  directories.push(path);
  return path;
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
  await expect(CredentialStorage.open(path)).rejects.toThrow("database is locked");
  await expect(storage.set("key", () => {})).rejects.toMatchObject({ code: "STORAGE_FAILED" });
  expect(() => storage.assertHealthy()).toThrow("Credential storage failed");
  await storage.close();
});
