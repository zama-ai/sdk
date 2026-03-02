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

  async get<T = unknown>(key: string): Promise<T | null> {
    const db = await this.#getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.#storeName, "readonly");
      tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
      const store = tx.objectStore(this.#storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    const db = await this.#getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.#storeName, "readwrite");
      tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
      const store = tx.objectStore(this.#storeName);
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.#getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.#storeName, "readwrite");
      tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
      const store = tx.objectStore(this.#storeName);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.#getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.#storeName, "readwrite");
      tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
      const store = tx.objectStore(this.#storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

/** Default singleton for application-wide use. */
export const indexedDBStorage = new IndexedDBStorage();
