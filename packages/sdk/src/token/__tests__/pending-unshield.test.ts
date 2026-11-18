import { describe, test, expect } from "../../test-fixtures";
import {
  clearPendingUnshield,
  loadPendingUnshieldRequests,
  savePendingUnshield,
} from "../pending-unshield";
import type { Address, Hex } from "viem";

const TX_A = `0x${"a1".repeat(32)}` as Hex;
const TX_B = `0x${"b2".repeat(32)}` as Hex;
const UNWRAP_REQUEST_ID = `0x${"aa".repeat(32)}` as const;

describe("pending-unshield persistence", () => {
  test("returns no entries when nothing is saved", async ({ storage, wrapperAddress }) => {
    expect(await loadPendingUnshieldRequests(storage, wrapperAddress)).toEqual([]);
  });

  test("saves and loads an unwrap tx hash", async ({ storage, wrapperAddress }) => {
    await savePendingUnshield(storage, wrapperAddress, TX_A);
    expect(await loadPendingUnshieldRequests(storage, wrapperAddress)).toEqual([
      { unwrapTxHash: TX_A },
    ]);
  });

  test("saving the same tx twice keeps one entry", async ({ storage, wrapperAddress }) => {
    await savePendingUnshield(storage, wrapperAddress, TX_A);
    await savePendingUnshield(storage, wrapperAddress, TX_A);
    expect(await loadPendingUnshieldRequests(storage, wrapperAddress)).toHaveLength(1);
  });

  test("a second unshield on the same wrapper keeps the first entry", async ({
    storage,
    wrapperAddress,
  }) => {
    await savePendingUnshield(storage, wrapperAddress, TX_A);
    await savePendingUnshield(storage, wrapperAddress, TX_B);
    expect(await loadPendingUnshieldRequests(storage, wrapperAddress)).toEqual([
      { unwrapTxHash: TX_A },
      { unwrapTxHash: TX_B },
    ]);
  });

  test("concurrent saves and clears in one tab keep every other entry", async ({
    storage,
    wrapperAddress,
  }) => {
    const TX_C = `0x${"c3".repeat(32)}` as Hex;
    await savePendingUnshield(storage, wrapperAddress, TX_A);
    await Promise.all([
      savePendingUnshield(storage, wrapperAddress, TX_B),
      clearPendingUnshield(storage, wrapperAddress, TX_A),
      savePendingUnshield(storage, wrapperAddress, TX_C),
    ]);
    expect(await loadPendingUnshieldRequests(storage, wrapperAddress)).toEqual([
      { unwrapTxHash: TX_B },
      { unwrapTxHash: TX_C },
    ]);
  });

  test("clearing one entry keeps the others", async ({ storage, wrapperAddress }) => {
    await savePendingUnshield(storage, wrapperAddress, TX_A);
    await savePendingUnshield(storage, wrapperAddress, TX_B);
    await clearPendingUnshield(storage, wrapperAddress, TX_B);
    expect(await loadPendingUnshieldRequests(storage, wrapperAddress)).toEqual([
      { unwrapTxHash: TX_A },
    ]);
  });

  test("clearing the last entry deletes the key", async ({ storage, wrapperAddress }) => {
    await savePendingUnshield(storage, wrapperAddress, TX_A);
    await clearPendingUnshield(storage, wrapperAddress, TX_A);
    expect(await storage.get(`zama:pending-unshield:${wrapperAddress}`)).toBeNull();
  });

  test("reads a bare tx hash saved by older SDK versions", async ({ storage, wrapperAddress }) => {
    await storage.set(`zama:pending-unshield:${wrapperAddress}`, TX_A);
    expect(await loadPendingUnshieldRequests(storage, wrapperAddress)).toEqual([
      { unwrapTxHash: TX_A },
    ]);
  });

  test("reads a version 1 entry saved by older SDK versions", async ({
    storage,
    wrapperAddress,
  }) => {
    await storage.set(`zama:pending-unshield:${wrapperAddress}`, {
      version: 1,
      unwrapTxHash: TX_A,
      unwrapRequestId: UNWRAP_REQUEST_ID,
    });
    expect(await loadPendingUnshieldRequests(storage, wrapperAddress)).toEqual([
      { unwrapTxHash: TX_A, unwrapRequestId: UNWRAP_REQUEST_ID },
    ]);
    await savePendingUnshield(storage, wrapperAddress, TX_B);
    expect(await loadPendingUnshieldRequests(storage, wrapperAddress)).toHaveLength(2);
  });

  test("isolates by wrapper address", async ({ storage, wrapperAddress }) => {
    const OTHER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
    await savePendingUnshield(storage, wrapperAddress, TX_A);
    expect(await loadPendingUnshieldRequests(storage, OTHER)).toEqual([]);
  });

  test("normalizes wrapper addresses for storage keys", async ({ storage, wrapperAddress }) => {
    await savePendingUnshield(storage, wrapperAddress.toLowerCase() as Address, TX_A);
    expect(await loadPendingUnshieldRequests(storage, wrapperAddress)).toHaveLength(1);
  });

  test("deletes invalid persisted pending unshield data", async ({ storage, wrapperAddress }) => {
    await storage.set(`zama:pending-unshield:${wrapperAddress}`, { unwrapTxHash: 123 });
    expect(await loadPendingUnshieldRequests(storage, wrapperAddress)).toEqual([]);
    expect(await storage.get(`zama:pending-unshield:${wrapperAddress}`)).toBeNull();
  });
});
