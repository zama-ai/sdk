import type { Redis } from "ioredis";

/**
 * Minimal async key-value abstraction each of the four stores
 * (`DelegationStore`, `BalanceStore`, `TransferStore`, `DecryptCache`) is
 * built on, instead of managing its own `Map` directly. One implementation
 * keeps today's default (in-memory, lost on restart); the other persists to
 * Redis. Every store maps naturally onto a Redis *hash* — `hashName` is the
 * hash key, `field` is what the store itself already used as its `Map` key
 * (e.g. `"delegator:contractAddress"`), `value` is a JSON-serialized record.
 *
 * Deliberately not a generic ORM/cache library: four `get`/`set`/`getAll`
 * methods cover every access pattern these stores need (point lookups,
 * upserts, and full scans for `list()`/`listFor()`).
 */
export interface KeyValueStore {
  get(field: string): Promise<string | undefined>;
  set(field: string, value: string): Promise<void>;
  getAll(): Promise<Record<string, string>>;
}

export function createInMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    async get(field) {
      return map.get(field);
    },
    async set(field, value) {
      map.set(field, value);
    },
    async getAll() {
      return Object.fromEntries(map);
    },
  };
}

export function createRedisStore(redis: Redis, hashName: string): KeyValueStore {
  return {
    async get(field) {
      const value = await redis.hget(hashName, field);
      return value ?? undefined;
    },
    async set(field, value) {
      await redis.hset(hashName, field, value);
    },
    async getAll() {
      return redis.hgetall(hashName);
    },
  };
}
