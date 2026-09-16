import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vitest";
import { CredentialStorage } from "../src/storage.js";
import { createCoordinator } from "../src/coordination.js";
import { SidecarRuntime } from "../src/runtime.js";
import { startServer } from "../src/server.js";

async function startChild(script: string, args: string[]) {
  const child = spawn(process.execPath, ["--input-type=module", "-e", script, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  await Promise.race([
    once(child.stdout, "data"),
    once(child, "exit").then(() => {
      throw new Error("Child exited before ready.");
    }),
  ]);
  return child;
}

test("retains the database lock across commits and releases it after SIGKILL", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sidecar-crash-"));
  const initial = await CredentialStorage.open(directory);
  await initial.set("permit", { signature: "test" });
  await expect(CredentialStorage.open(directory)).rejects.toThrow("database is locked");
  const competing = spawnSync(process.execPath, [
    "--input-type=module",
    "-e",
    `
    import { DatabaseSync } from 'node:sqlite';
    const db = new DatabaseSync(process.argv[1]);
    db.exec('BEGIN EXCLUSIVE;');
  `,
    join(directory, "credentials.sqlite"),
  ]);
  expect(competing.status).not.toBe(0);
  await initial.close();
  const child = await startChild(
    `
    import { DatabaseSync } from 'node:sqlite';
    const db = new DatabaseSync(process.argv[1]);
    db.exec('PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE; COMMIT;');
    process.stdout.write('ready');
    setInterval(() => {}, 1000);
  `,
    [join(directory, "credentials.sqlite")],
  );
  try {
    await expect(CredentialStorage.open(directory)).rejects.toThrow("database is locked");
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
    const restarted = await CredentialStorage.open(directory);
    expect(await restarted.get("permit")).toEqual({ signature: "test" });
    await restarted.close();
  } finally {
    child.kill("SIGKILL");
    await rm(directory, { recursive: true, force: true });
  }
});

test("recovers a crashed socket and restarts cleanly", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sidecar-socket-crash-"));
  const socket = join(directory, "sdk.sock");
  const child = await startChild(
    `
    import { createServer } from 'node:net';
    createServer().listen(process.argv[1], () => process.stdout.write('ready'));
  `,
    [socket],
  );
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
  const runtime = new SidecarRuntime(async () => {
    throw new Error("unused");
  }, createCoordinator());
  try {
    const stop = await startServer(runtime, socket, "test");
    await stop();
    const stopAgain = await startServer(runtime, socket, "test");
    expect(stopAgain).toBeTypeOf("function");
    await stopAgain();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
