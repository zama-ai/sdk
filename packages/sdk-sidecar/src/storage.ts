import { mkdir, open, lstat } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { serialize, deserialize } from "node:v8";
import type { GenericStorage } from "@zama-fhe/sdk";
import { status } from "@grpc/grpc-js";
import { SidecarError } from "./errors.js";

export class CredentialStorage implements GenericStorage {
  #failed = false;
  private constructor(private readonly database: DatabaseSync) {}

  static async open(directory: string): Promise<CredentialStorage> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await lstat(directory);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      (info.mode & 0o077) !== 0 ||
      info.uid !== process.getuid?.()
    ) {
      throw new Error("Storage directory must be private to its owner.");
    }
    const path = join(directory, "credentials.sqlite");
    try {
      const file = await open(path, "wx", 0o600);
      await file.close();
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
        throw error;
      }
    }
    const file = await lstat(path);
    if (
      !file.isFile() ||
      file.nlink !== 1 ||
      (file.mode & 0o077) !== 0 ||
      file.uid !== process.getuid?.()
    ) {
      throw new Error("Credential file must be private to its owner.");
    }
    const database = new DatabaseSync(path);
    try {
      database.exec(
        "PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE; CREATE TABLE IF NOT EXISTS credentials (key TEXT PRIMARY KEY, value BLOB NOT NULL); COMMIT;",
      );
      return new CredentialStorage(database);
    } catch (error) {
      database.close();
      throw error;
    }
  }

  #failure(): SidecarError {
    return new SidecarError(
      "STORAGE_FAILED",
      status.UNAVAILABLE,
      "Credential storage failed; restart required.",
    );
  }

  assertHealthy(): void {
    if (this.#failed) {
      throw this.#failure();
    }
  }

  #guard<T>(operation: () => T): T {
    this.assertHealthy();
    try {
      return operation();
    } catch {
      this.#failed = true;
      throw this.#failure();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    return this.#guard(() => {
      const row = this.database.prepare("SELECT value FROM credentials WHERE key = ?").get(key);
      if (!row) {
        return null;
      }
      if (!(row.value instanceof Uint8Array)) {
        throw new Error("Invalid credential data.");
      }
      return deserialize(row.value) as T;
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.#guard(() => {
      this.database
        .prepare(
          "INSERT INTO credentials (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run(key, serialize(value));
    });
  }

  async delete(key: string): Promise<void> {
    this.#guard(() => {
      this.database.prepare("DELETE FROM credentials WHERE key = ?").run(key);
    });
  }

  async close(): Promise<void> {
    this.database.close();
  }
}
