import { describe, it, expect } from "../../test-fixtures";
import {
  savePendingUnshield,
  loadPendingUnshield,
  clearPendingUnshield,
} from "../pending-unshield";
import type { PendingUnshieldScope } from "../pending-unshield";
import type { Address, Hex } from "../token.types";

const ACCOUNT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const CHAIN_ID = 31337;
const TX_HASH = "0xabc123" as Hex;

describe("pending-unshield persistence", () => {
  function makeScope(wrapperAddress: Address): PendingUnshieldScope {
    return { accountAddress: ACCOUNT, chainId: CHAIN_ID, wrapperAddress };
  }

  it("returns null when no pending unshield exists", async ({ storage, wrapperAddress }) => {
    expect(await loadPendingUnshield(storage, makeScope(wrapperAddress))).toBeNull();
  });

  it("saves and loads a pending unshield tx hash", async ({ storage, wrapperAddress }) => {
    const scope = makeScope(wrapperAddress);
    await savePendingUnshield(storage, scope, TX_HASH);
    expect(await loadPendingUnshield(storage, scope)).toBe(TX_HASH);
  });

  it("clears a pending unshield tx hash", async ({ storage, wrapperAddress }) => {
    const scope = makeScope(wrapperAddress);
    await savePendingUnshield(storage, scope, TX_HASH);
    await clearPendingUnshield(storage, scope);
    expect(await loadPendingUnshield(storage, scope)).toBeNull();
  });

  it("isolates by wrapper address", async ({ storage, wrapperAddress }) => {
    const scope = makeScope(wrapperAddress);
    const otherScope = makeScope("0x2222222222222222222222222222222222222222" as Address);
    await savePendingUnshield(storage, scope, TX_HASH);
    expect(await loadPendingUnshield(storage, otherScope)).toBeNull();
  });

  it("isolates by account address", async ({ storage, wrapperAddress }) => {
    const scope = makeScope(wrapperAddress);
    const otherScope: PendingUnshieldScope = {
      ...scope,
      accountAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    };
    await savePendingUnshield(storage, scope, TX_HASH);
    expect(await loadPendingUnshield(storage, otherScope)).toBeNull();
  });

  it("isolates by chain ID", async ({ storage, wrapperAddress }) => {
    const scope = makeScope(wrapperAddress);
    const otherScope: PendingUnshieldScope = { ...scope, chainId: 1 };
    await savePendingUnshield(storage, scope, TX_HASH);
    expect(await loadPendingUnshield(storage, otherScope)).toBeNull();
  });
});
