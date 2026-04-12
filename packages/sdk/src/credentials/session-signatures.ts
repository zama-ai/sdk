import type { Hex } from "viem";
import { assertCondition, assertObject, assertString } from "../utils";
import type { GenericStorage } from "../types";

/** Structured session entry stored in session storage. */
export interface SessionEntry {
  /** EIP-712 wallet signature authorizing decryption. */
  signature: Hex;
  /** Epoch seconds when the session was created. */
  createdAt: number;
  /** TTL at creation time (not current config). `0` = always expired, `"infinite"` = never expires. */
  ttl: number | "infinite";
}

/**
 * Manages session signature entries in a {@link GenericStorage} backend.
 *
 * A session entry caches a wallet signature so that subsequent decrypt
 * operations can reuse it without prompting the user again. The TTL
 * is recorded at creation time so that changing the config later does
 * not retroactively extend or shorten existing sessions.
 */
export class SessionSignatures {
  #storage: GenericStorage;

  constructor(storage: GenericStorage) {
    this.#storage = storage;
  }

  #key(key: string): string {
    return `signature:${key}`;
  }

  #assertSessionEntry(data: unknown): asserts data is SessionEntry {
    assertObject(data, "Session entry");
    assertString(data.signature, "session.signature");
    assertCondition(
      typeof data.createdAt === "number",
      `Expected session.createdAt to be a number`,
    );
    assertCondition(
      typeof data.ttl === "number" || data.ttl === "infinite",
      `Expected session.ttl to be a number or "infinite"`,
    );
  }

  /** Retrieve and validate a session entry, or `null` if none exists. */
  async get(key: string): Promise<SessionEntry | null> {
    const raw = await this.#storage.get<SessionEntry>(this.#key(key));
    if (raw === null) {
      return null;
    }
    this.#assertSessionEntry(raw);
    return raw;
  }

  /** Create and store a session entry with the given TTL. */
  async set(params: { key: string; signature: Hex; ttl: number | "infinite" }): Promise<void> {
    const entry: SessionEntry = {
      signature: params.signature,
      createdAt: Math.floor(Date.now() / 1000),
      ttl: params.ttl,
    };
    await this.#storage.set(this.#key(params.key), entry);
  }

  /** Delete a session entry. */
  async delete(key: string): Promise<void> {
    await this.#storage.delete(this.#key(key));
  }

  /**
   * Check if a session entry has expired based on its recorded TTL.
   * - `0` = always expired (every operation triggers a signing prompt).
   * - `"infinite"` = never expires.
   * - Positive number = seconds until expiration.
   */
  isExpired(entry: SessionEntry): boolean {
    if (entry.ttl === "infinite") {
      return false;
    }
    if (entry.ttl === 0) {
      return true;
    }
    return Math.floor(Date.now() / 1000) - entry.createdAt >= entry.ttl;
  }
}
