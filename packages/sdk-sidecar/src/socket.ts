import { invalidArgument } from "./errors.js";
import { lstat, unlink } from "node:fs/promises";
import { createConnection } from "node:net";
import { dirname } from "node:path";

export async function prepareSocket(path: string): Promise<void> {
  const parent = await lstat(dirname(path));
  if (
    !parent.isDirectory() ||
    parent.isSymbolicLink() ||
    (parent.mode & 0o077) !== 0 ||
    parent.uid !== process.getuid?.()
  ) {
    throw invalidArgument("Socket directory must be private to its owner.");
  }
  let existing;
  try {
    existing = await lstat(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  if (!existing.isSocket() || existing.uid !== process.getuid?.()) {
    throw invalidArgument("Socket path already exists.");
  }
  const stale = await new Promise<boolean>((resolve, reject) => {
    const socket = createConnection(path);
    socket.setTimeout(1_000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("Socket probe timed out."));
    });
    socket.once("error", (error) => {
      socket.destroy();
      if ("code" in error && error.code === "ECONNREFUSED") {
        resolve(true);
      } else {
        reject(error);
      }
    });
  });
  if (!stale) {
    throw invalidArgument("Socket path already exists.");
  }
  const current = await lstat(path);
  if (current.ino !== existing.ino || current.dev !== existing.dev) {
    throw invalidArgument("Socket path changed.");
  }
  await unlink(path);
}
