"use client";

import type { GenericStringStorage } from "./token.types";

/**
 * IndexedDB-backed {@link GenericStringStorage}.
 *
 * Stores encrypted credential JSON strings keyed by a hashed wallet address.
 * Encryption is handled by {@link CredentialManager} — this store only
 * persists opaque string values.
 */
export class IndexedDBStorage implements GenericStringStorage {
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
        this.#db.onversionchange = () => {
          this.#db?.close();
          this.#db = null;
        };
        this.#db.onclose = () => {
          this.#db = null;
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

  async getItem(key: string): Promise<string | null> {
    const db = await this.#getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.#storeName, "readonly");
      const store = tx.objectStore(this.#storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async setItem(key: string, value: string): Promise<void> {
    const db = await this.#getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.#storeName, "readwrite");
      const store = tx.objectStore(this.#storeName);
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async removeItem(key: string): Promise<void> {
    const db = await this.#getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.#storeName, "readwrite");
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
      const store = tx.objectStore(this.#storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

/** Default singleton for application-wide use. */
export const indexedDBStorage = new IndexedDBStorage();
