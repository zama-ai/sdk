import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { MemoryStorage, type GenericStorage } from "@zama-fhe/sdk";
import type { StorageBinding } from "./generated/zama/sdk/v1alpha1/sidecar.js";
import type { RemoteStorage } from "./remote-storage.js";
import { invalidArgument } from "./errors.js";
import type { CredentialStorage } from "./storage.js";

type ResolvedStorage = { storage: GenericStorage; identity: string };
export class StorageManager {
  #persistent = new Map<string, Promise<CredentialStorage>>();
  constructor(private readonly directory?: string) {}
  async resolve(
    binding: StorageBinding | undefined,
    remote: RemoteStorage,
  ): Promise<ResolvedStorage> {
    const backend = binding?.backend;
    if (!binding || backend?.$case === "memory") {
      return { storage: new MemoryStorage(), identity: `memory:${randomUUID()}` };
    }
    if (backend?.$case === "application") {
      if (!backend.application) {
        throw invalidArgument("Application storage backend ID is required.");
      }
      return {
        storage: remote.forBackend(backend.application),
        identity: `application:${backend.application}`,
      };
    }
    if (backend?.$case === "persistent") {
      if (!backend.persistent || !this.directory) {
        throw invalidArgument(
          "Named persistent storage requires a name and a configured storage directory.",
        );
      }
      const name = backend.persistent;
      let opened = this.#persistent.get(name);
      if (!opened) {
        const path = join(this.directory, createHash("sha256").update(name).digest("hex"));
        opened = import("./storage.js").then(({ CredentialStorage }) =>
          CredentialStorage.open(path),
        );
        this.#persistent.set(name, opened);
        void opened.catch(() => {
          this.#persistent.delete(name);
        });
      }
      return { storage: await opened, identity: `persistent:${name}` };
    }
    throw invalidArgument("Select a storage backend.");
  }
  async close(): Promise<void> {
    await Promise.allSettled(
      [...this.#persistent.values()].map(async (opened) => (await opened).close()),
    );
  }
}
