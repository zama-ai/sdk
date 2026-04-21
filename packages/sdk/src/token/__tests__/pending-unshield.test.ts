import { describe, it, expect } from "../../test-fixtures";
import {
  savePendingUnshield,
  loadPendingUnshield,
  loadPendingUnshieldRequest,
  clearPendingUnshield,
} from "../pending-unshield";
import type { Address, Hex } from "viem";

const TX_HASH = "0xabc123" as Hex;
const UNWRAP_REQUEST_ID = `0x${"aa".repeat(32)}` as const;

describe("pending-unshield persistence", () => {
  it("returns null when no pending unshield exists", async ({ storage, wrapperAddress }) => {
    expect(await loadPendingUnshield(storage, wrapperAddress)).toBeNull();
  });

  it("saves and loads a pending unshield tx hash", async ({ storage, wrapperAddress }) => {
    await savePendingUnshield(storage, wrapperAddress, TX_HASH);
    expect(await loadPendingUnshield(storage, wrapperAddress)).toBe(TX_HASH);
  });

  it("saves and loads a pending unshield request with unwrapRequestId", async ({
    storage,
    wrapperAddress,
  }) => {
    await savePendingUnshield(storage, wrapperAddress, TX_HASH, UNWRAP_REQUEST_ID);

    expect(await loadPendingUnshield(storage, wrapperAddress)).toBe(TX_HASH);
    expect(await loadPendingUnshieldRequest(storage, wrapperAddress)).toEqual({
      unwrapTxHash: TX_HASH,
      unwrapRequestId: UNWRAP_REQUEST_ID,
    });
  });

  it("normalizes legacy tx-hash-only pending unshields", async ({ storage, wrapperAddress }) => {
    await savePendingUnshield(storage, wrapperAddress, TX_HASH);
    expect(await loadPendingUnshieldRequest(storage, wrapperAddress)).toEqual({
      unwrapTxHash: TX_HASH,
    });
  });

  it("clears a pending unshield tx hash", async ({ storage, wrapperAddress }) => {
    await savePendingUnshield(storage, wrapperAddress, TX_HASH);
    await clearPendingUnshield(storage, wrapperAddress);
    expect(await loadPendingUnshield(storage, wrapperAddress)).toBeNull();
  });

  it("isolates by wrapper address", async ({ storage, wrapperAddress }) => {
    const OTHER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
    await savePendingUnshield(storage, wrapperAddress, TX_HASH);
    expect(await loadPendingUnshield(storage, OTHER)).toBeNull();
  });
});
