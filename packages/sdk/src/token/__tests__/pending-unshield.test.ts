import { describe, test, expect } from "../../test-fixtures";
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
  test("returns null when no pending unshield exists", async ({ storage, wrapperAddress }) => {
    expect(await loadPendingUnshield(storage, wrapperAddress)).toBeNull();
  });

  test("saves and loads a pending unshield tx hash", async ({ storage, wrapperAddress }) => {
    await savePendingUnshield(storage, wrapperAddress, TX_HASH);
    expect(await loadPendingUnshield(storage, wrapperAddress)).toBe(TX_HASH);
  });

  test("saves and loads a pending unshield request with unwrapRequestId", async ({
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

  test("normalizes tx-hash-only pending unshields from older SDK versions", async ({
    storage,
    wrapperAddress,
  }) => {
    await savePendingUnshield(storage, wrapperAddress, TX_HASH);
    expect(await loadPendingUnshieldRequest(storage, wrapperAddress)).toEqual({
      unwrapTxHash: TX_HASH,
    });
  });

  test("clears a pending unshield tx hash", async ({ storage, wrapperAddress }) => {
    await savePendingUnshield(storage, wrapperAddress, TX_HASH);
    await clearPendingUnshield(storage, wrapperAddress);
    expect(await loadPendingUnshield(storage, wrapperAddress)).toBeNull();
  });

  test("isolates by wrapper address", async ({ storage, wrapperAddress }) => {
    const OTHER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
    await savePendingUnshield(storage, wrapperAddress, TX_HASH);
    expect(await loadPendingUnshield(storage, OTHER)).toBeNull();
  });

  test("normalizes wrapper addresses for storage keys", async ({ storage, wrapperAddress }) => {
    await savePendingUnshield(storage, wrapperAddress.toLowerCase() as Address, TX_HASH);
    expect(await loadPendingUnshield(storage, wrapperAddress)).toBe(TX_HASH);
  });

  test("deletes invalid persisted pending unshield data", async ({ storage, wrapperAddress }) => {
    await storage.set(`zama:pending-unshield:${wrapperAddress}`, { unwrapTxHash: 123 });
    expect(await loadPendingUnshield(storage, wrapperAddress)).toBeNull();
    expect(await storage.get(`zama:pending-unshield:${wrapperAddress}`)).toBeNull();
  });
});
