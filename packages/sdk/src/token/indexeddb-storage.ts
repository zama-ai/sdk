"use client";

import type { GenericStorage } from "./token.types";

/**
 * IndexedDB-backed {@link GenericStorage}.
 *
 * Stores encrypted credential objects keyed by a hashed wallet address.
 * Encryption is handled by {@link CredentialsManager} — this store only
 * persists opaque values.
 */
export class IndexedDBStorage implements GenericStorage {
  #db: IDBDatabase | null = null;
  #dbPromise: Promise<IDBDatabase> | null = null;
  #dbName: string;
  #dbVersion: number;
  #storeName = "credentials";

  constructor(dbName = "CredentialStore", dbVersion = 1) {
    this.#dbName = dbName;
    this.#dbVersion = dbVersion;
  }

  #getDB(): Promise<IDBDatabase> {
    if (this.#db) return Promise.resolve(this.#db);
    if (this.#dbPromise) return this.#dbPromise;

    this.#dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.#dbName, this.#dbVersion);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.#storeName)) {
          db.createObjectStore(this.#storeName, { keyPath: "key" });
        }
      };

      request.onsuccess = () => {
        this.#db = request.result;
        this.#dbPromise = null;
        this.#db.onversionchange = () => {
          this.#db?.close();
          this.#db = null;
          this.#dbPromise = null;
        };
        this.#db.onclose = () => {
          this.#db = null;
          this.#dbPromise = null;
        };
        resolve(this.#db);
      };

      request.onerror = () => {
        this.#db = null;
        this.#dbPromise = null;
        reject(request.error);
      };
    });

    return this.#dbPromise;
  }

  async #withTransaction<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T> {
    const db = await this.#getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.#storeName, mode);
      tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
      const request = fn(tx.objectStore(this.#storeName));
      if (mode === "readonly") {
        request.onsuccess = () => resolve(request.result);
      } else {
        tx.oncomplete = () => resolve(request.result);
      }
      request.onerror = () => reject(request.error);
    });
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const result = await this.#withTransaction<{ value: T } | undefined>("readonly", (store) =>
      store.get(key),
    );
    return result?.value ?? null;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    await this.#withTransaction<void>("readwrite", (store) => store.put({ key, value }));
  }

  async delete(key: string): Promise<void> {
    await this.#withTransaction<void>("readwrite", (store) => store.delete(key));
  }

  async clear(): Promise<void> {
    await this.#withTransaction<void>("readwrite", (store) => store.clear());
  }
}

/** Default singleton for application-wide use. */
export const indexedDBStorage = new IndexedDBStorage();
