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

const StoredListSchema = z.object({ version: z.number(), unwrapTxHashes: z.optional(z.unknown()) });

const sameTx = (a: Hex, b: Hex) => a.toLowerCase() === b.toLowerCase();

type ReadOnlyStorage = Pick<GenericStorage, "get">;

interface Loaded {
  readonly hashes: Hex[];
  /** False when the key holds a version this SDK does not know: it is left as is. */
  readonly writable: boolean;
  /** A legacy entry was merged in memory; the next write moves it into the list. */
  readonly hasLegacy: boolean;
}

async function readList(
  storage: ReadOnlyStorage,
  key: string,
  logger: GenericLogger | undefined,
): Promise<Omit<Loaded, "hasLegacy">> {
  const value = await storage.get(key);
  if (value === null || value === undefined) {
    return { hashes: [], writable: true };
  }
  const parsed = StoredListSchema.safeParse(value);
  if (parsed.success && parsed.data.version !== CURRENT_VERSION) {
    logger?.warn("pending unshields saved by an unknown SDK version were left as is", {
      version: parsed.data.version,
    });
    return { hashes: [], writable: false };
  }
  const unwrapTxHashes = parsed.success ? parsed.data.unwrapTxHashes : undefined;
  if (!Array.isArray(unwrapTxHashes)) {
    logger?.warn("unreadable pending unshields were dropped", { value });
    return { hashes: [], writable: true };
  }
  const hashes = unwrapTxHashes.filter((h): h is Hex => hex.safeParse(h).success);
  if (hashes.length !== unwrapTxHashes.length) {
    logger?.warn("unreadable pending unshield entries were dropped", { unwrapTxHashes });
  }
  return { hashes, writable: true };
}

// Merges a hash an older SDK wrote under the legacy key, in memory only.
async function read(
  storage: ReadOnlyStorage,
  wrapperAddress: Address,
  logger: GenericLogger | undefined,
): Promise<Loaded> {
  const list = await readList(storage, pendingUnshieldsKey(wrapperAddress), logger);
  const legacy = LegacySchema.safeParse(
    await storage.get(legacyPendingUnshieldKey(wrapperAddress)),
  );
  if (!legacy.success || !list.writable) {
    return { ...list, hasLegacy: false };
  }
  const hashes = list.hashes.some((h) => sameTx(h, legacy.data))
    ? list.hashes
    : [legacy.data, ...list.hashes];
  return { hashes, writable: true, hasLegacy: true };
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
const writeQueues = new WeakMap<object, Promise<void>>();

function serialized<T>(storage: object, task: () => Promise<T>): Promise<T> {
  const run = (writeQueues.get(storage) ?? Promise.resolve()).then(task);
  writeQueues.set(
    storage,
    run.then(
      () => {},
      () => {},
    ),
  );
  return run;
}

// The only writer. `change` only adds or only removes, so a changed list has a
// new length. A merged legacy entry is written into the list, then deleted.
function update(
  storage: GenericStorage,
  wrapperAddress: Address,
  logger: GenericLogger | undefined,
  change: (hashes: Hex[]) => Hex[],
): Promise<void> {
  return serialized(storage, async () => {
    const { hashes, writable, hasLegacy } = await read(storage, wrapperAddress, logger);
    if (!writable) {
      return;
    }
    const next = change(hashes);
    if (hasLegacy || next.length !== hashes.length) {
      await writeList(storage, wrapperAddress, next);
    }
    if (hasLegacy) {
      await storage.delete(legacyPendingUnshieldKey(wrapperAddress));
    }
  });
}

/**
 * Load the unwrap tx hash of every saved pending unshield for this wrapper,
 * oldest first. Never writes storage.
 *
 * @internal
 */
export async function loadPendingUnshields(
  storage: ReadOnlyStorage,
  wrapperAddress: Address,
  logger?: GenericLogger,
): Promise<Hex[]> {
  return (await serialized(storage, () => read(storage, wrapperAddress, logger))).hashes;
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
  return update(storage, wrapperAddress, logger, (hashes) =>
    hashes.some((h) => sameTx(h, unwrapTxHash)) ? hashes : [...hashes, unwrapTxHash],
  );
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
  return update(storage, wrapperAddress, logger, (hashes) =>
    hashes.filter((h) => !sameTx(h, unwrapTxHash)),
  );
}
