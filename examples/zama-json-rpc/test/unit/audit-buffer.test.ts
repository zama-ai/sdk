import { describe, expect, it } from "vitest";
import { AuditBuffer } from "../../src/logging/audit-buffer.js";

describe("AuditBuffer", () => {
  it("returns pushed entries with a timestamp, oldest first", () => {
    const buffer = new AuditBuffer();
    buffer.push({ decision: "passthrough", method: "eth_blockNumber" });
    buffer.push({
      decision: "rewritten",
      method: "eth_sendTransaction",
      contractAddress: "0xabc",
      operation: "confidentialTransfer",
    });

    const entries = buffer.list();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.entry).toEqual({ decision: "passthrough", method: "eth_blockNumber" });
    expect(entries[1]?.entry.decision).toBe("rewritten");
    expect(entries[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("drops the oldest entry once over capacity", () => {
    const buffer = new AuditBuffer(2);
    buffer.push({ decision: "passthrough", method: "a" });
    buffer.push({ decision: "passthrough", method: "b" });
    buffer.push({ decision: "passthrough", method: "c" });

    const entries = buffer.list();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => (e.entry as { method: string }).method)).toEqual(["b", "c"]);
  });
});
