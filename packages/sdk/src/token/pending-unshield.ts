import type { Address, Hex } from "viem";
import { z } from "zod/mini";
import { checksum, hex } from "../schemas/primitives";
import type { GenericLogger, GenericStorage } from "../types";

const CURRENT_VERSION = 2;

/**
 * Key of this wrapper's pending unshields. A new key, so SDK versions that
 * only know the legacy key never read (and delete) the list.
 *
 * @internal
 */
export function pendingUnshieldsKey(wrapperAddress: Address): string {
  return `zama:pending-unshields:${checksum(wrapperAddress)}`;
}

/**
 * The key SDK 3.8 and older write one bare hash or a version 1 object to.
 * They delete any other value they find there.
 *
 * @internal
 */
export function legacyPendingUnshieldKey(wrapperAddress: Address): string {
  return `zama:pending-unshield:${checksum(wrapperAddress)}`;
}

/**
 * The stored value for a list of unwrap tx hashes, oldest first.
 *
 * @internal
 */
export function encodePendingUnshields(unwrapTxHashes: readonly Hex[]) {
  return { version: CURRENT_VERSION, unwrapTxHashes };
}

const LegacySchema = z.union([
  hex,
  z.pipe(
    z.object({ version: z.literal(1), unwrapTxHash: hex }),
    z.transform(({ unwrapTxHash }) => unwrapTxHash),
  ),
]);

const sameTx = (a: Hex, b: Hex) => a.toLowerCase() === b.toLowerCase();

interface Loaded {
  readonly hashes: Hex[];
  /** False when the key holds a version this SDK does not know: it is left as is. */
  readonly writable: boolean;
}

async function readList(
  storage: GenericStorage,
  key: string,
  logger: GenericLogger | undefined,
): Promise<Loaded> {
  const value = await storage.get(key);
  if (value === null || value === undefined) {
    return { hashes: [], writable: true };
  }
  const { version, unwrapTxHashes } = (typeof value === "object" ? value : {}) as {
    version?: unknown;
    unwrapTxHashes?: unknown;
  };
  if (typeof version === "number" && version !== CURRENT_VERSION) {
    logger?.warn("pending unshields saved by an unknown SDK version were left as is", { version });
    return { hashes: [], writable: false };
  }
  if (version !== CURRENT_VERSION || !Array.isArray(unwrapTxHashes)) {
    logger?.warn("unreadable pending unshields were dropped", { value });
    return { hashes: [], writable: true };
  }
  const hashes = unwrapTxHashes.filter((h): h is Hex => hex.safeParse(h).success);
  if (hashes.length !== unwrapTxHashes.length) {
    logger?.warn("unreadable pending unshield entries were dropped", { unwrapTxHashes });
  }
  return { hashes, writable: true };
}

async function writeList(
  storage: GenericStorage,
  wrapperAddress: Address,
  hashes: readonly Hex[],
): Promise<void> {
  const key = pendingUnshieldsKey(wrapperAddress);
  await (hashes.length === 0
    ? storage.delete(key)
    : storage.set(key, encodePendingUnshields(hashes)));
}

// Read-modify-write on one storage runs one at a time, so two unshields in
// the same tab cannot drop each other's entry. Tabs still race: GenericStorage
// has no atomic update.
const writeQueues = new WeakMap<GenericStorage, Promise<void>>();

function serialized<T>(storage: GenericStorage, update: () => Promise<T>): Promise<T> {
  const run = (writeQueues.get(storage) ?? Promise.resolve()).then(update);
  writeQueues.set(
    storage,
    run.then(
      () => {},
      () => {},
    ),
  );
  return run;
}

// Moves a hash an older SDK wrote under the legacy key into the list.
async function load(
  storage: GenericStorage,
  wrapperAddress: Address,
  logger: GenericLogger | undefined,
): Promise<Loaded> {
  const loaded = await readList(storage, pendingUnshieldsKey(wrapperAddress), logger);
  const legacy = LegacySchema.safeParse(
    await storage.get(legacyPendingUnshieldKey(wrapperAddress)),
  );
  if (!legacy.success || !loaded.writable) {
    return loaded;
  }
  const hashes = loaded.hashes.some((h) => sameTx(h, legacy.data))
    ? loaded.hashes
    : [legacy.data, ...loaded.hashes];
  await writeList(storage, wrapperAddress, hashes);
  await storage.delete(legacyPendingUnshieldKey(wrapperAddress));
  return { hashes, writable: true };
}

/**
 * Load the unwrap tx hash of every saved pending unshield for this wrapper,
 * oldest first.
 *
 * @internal
 */
export async function loadPendingUnshields(
  storage: GenericStorage,
  wrapperAddress: Address,
  logger?: GenericLogger,
): Promise<Hex[]> {
  return (await serialized(storage, () => load(storage, wrapperAddress, logger))).hashes;
}

/**
 * Persist an unwrap so an interrupted unshield can be resumed later (e.g.
 * after a page reload). Entries for other unwraps are kept.
 *
 * @internal
 */
export function savePendingUnshield(
  storage: GenericStorage,
  wrapperAddress: Address,
  unwrapTxHash: Hex,
  logger?: GenericLogger,
): Promise<void> {
  return serialized(storage, async () => {
    const { hashes, writable } = await load(storage, wrapperAddress, logger);
    if (writable && !hashes.some((h) => sameTx(h, unwrapTxHash))) {
      await writeList(storage, wrapperAddress, [...hashes, unwrapTxHash]);
    }
  });
}

/**
 * Remove the entry for one unwrap transaction, once it is settled. Entries
 * for other unwraps are kept.
 *
 * @internal
 */
export function clearPendingUnshield(
  storage: GenericStorage,
  wrapperAddress: Address,
  unwrapTxHash: Hex,
  logger?: GenericLogger,
): Promise<void> {
  return serialized(storage, async () => {
    const { hashes, writable } = await load(storage, wrapperAddress, logger);
    const rest = hashes.filter((h) => !sameTx(h, unwrapTxHash));
    if (writable && rest.length !== hashes.length) {
      await writeList(storage, wrapperAddress, rest);
    }
  });
}
