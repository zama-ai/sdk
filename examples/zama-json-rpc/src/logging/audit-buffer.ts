import type { AuditEntry } from "./logger.js";

export interface TimestampedAuditEntry {
  timestamp: string;
  entry: AuditEntry;
}

/**
 * In-memory ring buffer of recent audit entries, exposed via `GET /audit`
 * (see `server.ts`) so a UI can poll and show real rewrite decisions instead
 * of only reading them from the process's own stdout. Same data
 * `logger.audit()` already writes — this just also keeps the last `capacity`
 * entries queryable over HTTP. Not persisted, not for production monitoring.
 */
export class AuditBuffer {
  readonly #entries: TimestampedAuditEntry[] = [];
  readonly #capacity: number;

  constructor(capacity = 200) {
    this.#capacity = capacity;
  }

  push(entry: AuditEntry): void {
    this.#entries.push({ timestamp: new Date().toISOString(), entry });
    if (this.#entries.length > this.#capacity) {
      this.#entries.shift();
    }
  }

  list(): TimestampedAuditEntry[] {
    return [...this.#entries];
  }
}
