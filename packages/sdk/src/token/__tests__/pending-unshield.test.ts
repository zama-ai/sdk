import { describe, test, expect, makeLogger } from "../../test-fixtures";
import {
  clearPendingUnshield,
  encodePendingUnshields,
  loadPendingUnshields,
  pendingUnshieldsKey,
  savePendingUnshield,
} from "../pending-unshield";
import type { Address, Hex } from "viem";

const TX_A = `0x${"a1".repeat(32)}` as Hex;
const TX_B = `0x${"b2".repeat(32)}` as Hex;
const UNWRAP_REQUEST_ID = `0x${"aa".repeat(32)}` as const;
const legacyKey = (wrapper: Address) => `zama:pending-unshield:${wrapper}`;

describe("pending-unshield persistence", () => {
  test("returns no entries when nothing is saved", async ({ storage, wrapperAddress }) => {
    expect(await loadPendingUnshields(storage, wrapperAddress)).toEqual([]);
  });

  test("saves and loads an unwrap tx hash", async ({ storage, wrapperAddress }) => {
    await savePendingUnshield(storage, wrapperAddress, TX_A);
    expect(await loadPendingUnshields(storage, wrapperAddress)).toEqual([TX_A]);
    expect(await storage.get(pendingUnshieldsKey(wrapperAddress))).toEqual(
      encodePendingUnshields([TX_A]),
    );
  });

  test("saving the same tx twice keeps one entry", async ({ storage, wrapperAddress }) => {
    await savePendingUnshield(storage, wrapperAddress, TX_A);
    await savePendingUnshield(storage, wrapperAddress, TX_A);
    expect(await loadPendingUnshields(storage, wrapperAddress)).toHaveLength(1);
  });

  test("a second unshield on the same wrapper keeps the first entry", async ({
    storage,
    wrapperAddress,
  }) => {
    await savePendingUnshield(storage, wrapperAddress, TX_A);
    await savePendingUnshield(storage, wrapperAddress, TX_B);
    expect(await loadPendingUnshields(storage, wrapperAddress)).toEqual([TX_A, TX_B]);
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
    expect(await loadPendingUnshields(storage, wrapperAddress)).toEqual([TX_B, TX_C]);
  });

  test("clearing one entry keeps the others", async ({ storage, wrapperAddress }) => {
    await savePendingUnshield(storage, wrapperAddress, TX_A);
    await savePendingUnshield(storage, wrapperAddress, TX_B);
    await clearPendingUnshield(storage, wrapperAddress, TX_B);
    expect(await loadPendingUnshields(storage, wrapperAddress)).toEqual([TX_A]);
  });

  test("clearing the last entry deletes the key", async ({ storage, wrapperAddress }) => {
    await savePendingUnshield(storage, wrapperAddress, TX_A);
    await clearPendingUnshield(storage, wrapperAddress, TX_A);
    expect(await storage.get(pendingUnshieldsKey(wrapperAddress))).toBeNull();
  });

  test("never writes the key older SDK versions read", async ({ storage, wrapperAddress }) => {
    await savePendingUnshield(storage, wrapperAddress, TX_A);
    expect(await storage.get(legacyKey(wrapperAddress))).toBeNull();
  });

  test("moves a bare tx hash saved by older SDK versions into the list", async ({
    storage,
    wrapperAddress,
  }) => {
    await savePendingUnshield(storage, wrapperAddress, TX_B);
    await storage.set(legacyKey(wrapperAddress), TX_A);
    expect(await loadPendingUnshields(storage, wrapperAddress)).toEqual([TX_A, TX_B]);
    expect(await storage.get(legacyKey(wrapperAddress))).toBeNull();
    expect(await storage.get(pendingUnshieldsKey(wrapperAddress))).toEqual(
      encodePendingUnshields([TX_A, TX_B]),
    );
  });

  test("moves a version 1 entry saved by older SDK versions into the list", async ({
    storage,
    wrapperAddress,
  }) => {
    await storage.set(legacyKey(wrapperAddress), {
      version: 1,
      unwrapTxHash: TX_A,
      unwrapRequestId: UNWRAP_REQUEST_ID,
    });
    await savePendingUnshield(storage, wrapperAddress, TX_B);
    expect(await loadPendingUnshields(storage, wrapperAddress)).toEqual([TX_A, TX_B]);
    expect(await storage.get(legacyKey(wrapperAddress))).toBeNull();
  });

  test("isolates by wrapper address", async ({ storage, wrapperAddress }) => {
    const OTHER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
    await savePendingUnshield(storage, wrapperAddress, TX_A);
    expect(await loadPendingUnshields(storage, OTHER)).toEqual([]);
  });

  test("normalizes wrapper addresses for storage keys", async ({ storage, wrapperAddress }) => {
    await savePendingUnshield(storage, wrapperAddress.toLowerCase() as Address, TX_A);
    expect(await loadPendingUnshields(storage, wrapperAddress)).toHaveLength(1);
  });

  test("drops only the unreadable entries, with a warning", async ({ storage, wrapperAddress }) => {
    const logger = makeLogger();
    await storage.set(pendingUnshieldsKey(wrapperAddress), {
      version: 2,
      unwrapTxHashes: [TX_A, 123, TX_B],
    });
    expect(await loadPendingUnshields(storage, wrapperAddress, logger)).toEqual([TX_A, TX_B]);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  test("leaves a list saved by an unknown SDK version as is", async ({
    storage,
    wrapperAddress,
  }) => {
    const logger = makeLogger();
    const future = { version: 3, entries: [TX_A] };
    await storage.set(pendingUnshieldsKey(wrapperAddress), future);
    expect(await loadPendingUnshields(storage, wrapperAddress, logger)).toEqual([]);
    await savePendingUnshield(storage, wrapperAddress, TX_B, logger);
    await clearPendingUnshield(storage, wrapperAddress, TX_A, logger);
    expect(await storage.get(pendingUnshieldsKey(wrapperAddress))).toEqual(future);
    expect(logger.warn).toHaveBeenCalled();
  });
});
