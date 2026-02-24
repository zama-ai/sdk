import { describe, it, expect } from "vitest";
import { MemoryStorage } from "../memory-storage";
import {
  savePendingUnshield,
  loadPendingUnshield,
  clearPendingUnshield,
} from "../pending-unshield";
import type { Address, Hex } from "../token.types";

const WRAPPER = "0x1111111111111111111111111111111111111111" as Address;
const TX_HASH = "0xabc123" as Hex;

describe("pending-unshield persistence", () => {
  it("returns null when no pending unshield exists", async () => {
    const storage = new MemoryStorage();
    expect(await loadPendingUnshield(storage, WRAPPER)).toBeNull();
  });

  it("saves and loads a pending unshield tx hash", async () => {
    const storage = new MemoryStorage();
    await savePendingUnshield(storage, WRAPPER, TX_HASH);
    expect(await loadPendingUnshield(storage, WRAPPER)).toBe(TX_HASH);
  });

  it("clears a pending unshield tx hash", async () => {
    const storage = new MemoryStorage();
    await savePendingUnshield(storage, WRAPPER, TX_HASH);
    await clearPendingUnshield(storage, WRAPPER);
    expect(await loadPendingUnshield(storage, WRAPPER)).toBeNull();
  });

  it("isolates by wrapper address", async () => {
    const storage = new MemoryStorage();
    const OTHER = "0x2222222222222222222222222222222222222222" as Address;
    await savePendingUnshield(storage, WRAPPER, TX_HASH);
    expect(await loadPendingUnshield(storage, OTHER)).toBeNull();
  });
});
