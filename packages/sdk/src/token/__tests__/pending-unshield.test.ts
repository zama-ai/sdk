import { describe, it, expect } from "vitest";
import { MemoryStorage } from "../memory-storage";
import {
  savePendingUnshield,
  loadPendingUnshield,
  clearPendingUnshield,
} from "../pending-unshield";
import type { PendingUnshieldScope } from "../pending-unshield";
import type { Address, Hex } from "../token.types";

const ACCOUNT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const WRAPPER = "0x1111111111111111111111111111111111111111" as Address;
const CHAIN_ID = 31337;
const TX_HASH = "0xabc123" as Hex;

const scope: PendingUnshieldScope = {
  accountAddress: ACCOUNT,
  chainId: CHAIN_ID,
  wrapperAddress: WRAPPER,
};

describe("pending-unshield persistence", () => {
  it("returns null when no pending unshield exists", async () => {
    const storage = new MemoryStorage();
    expect(await loadPendingUnshield(storage, scope)).toBeNull();
  });

  it("saves and loads a pending unshield tx hash", async () => {
    const storage = new MemoryStorage();
    await savePendingUnshield(storage, scope, TX_HASH);
    expect(await loadPendingUnshield(storage, scope)).toBe(TX_HASH);
  });

  it("clears a pending unshield tx hash", async () => {
    const storage = new MemoryStorage();
    await savePendingUnshield(storage, scope, TX_HASH);
    await clearPendingUnshield(storage, scope);
    expect(await loadPendingUnshield(storage, scope)).toBeNull();
  });

  it("isolates by wrapper address", async () => {
    const storage = new MemoryStorage();
    const otherScope: PendingUnshieldScope = {
      ...scope,
      wrapperAddress: "0x2222222222222222222222222222222222222222" as Address,
    };
    await savePendingUnshield(storage, scope, TX_HASH);
    expect(await loadPendingUnshield(storage, otherScope)).toBeNull();
  });

  it("isolates by account address", async () => {
    const storage = new MemoryStorage();
    const otherScope: PendingUnshieldScope = {
      ...scope,
      accountAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    };
    await savePendingUnshield(storage, scope, TX_HASH);
    expect(await loadPendingUnshield(storage, otherScope)).toBeNull();
  });

  it("isolates by chain ID", async () => {
    const storage = new MemoryStorage();
    const otherScope: PendingUnshieldScope = { ...scope, chainId: 1 };
    await savePendingUnshield(storage, scope, TX_HASH);
    expect(await loadPendingUnshield(storage, otherScope)).toBeNull();
  });
});
