import type { SerializeTransportKeyPairReturnType } from "@fhevm/sdk/actions/chain";
import { vi } from "vitest";
import { MemoryStorage } from "../../storage/memory-storage";
import type { GenericStorage } from "../../types";
import { TransportKeyPairVault } from "../keypair-vault";
import { DerivationSecretHolder } from "../keypair-wrapping";
import { checksum } from "../utils";

export const USER = checksum("0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B");
export const OTHER = checksum("0x3c3C3c3C3c3C3c3C3c3C3c3C3c3C3c3C3c3C3c3C");
export const PUBLIC_KEY = `0x${"11".repeat(32)}` as const;
export const PRIVATE_KEY = `0x${"22".repeat(32)}` as const;
export const TTL_SECONDS = 86400;

const holder = (secret: string | Uint8Array) => new DerivationSecretHolder(secret);

export const makeLogger = () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() });

export type MockLogger = ReturnType<typeof makeLogger>;

export type Generator = () => Promise<SerializeTransportKeyPairReturnType>;

export function makeGenerator(): Generator {
  // Each call generates a unique keypair so cache hits/misses are observable
  // via equality without poking the generator's call count.
  let counter = 0;
  return vi.fn().mockImplementation(async () => {
    counter += 1;
    return {
      publicKey: (PUBLIC_KEY.slice(0, -2) +
        counter
          .toString(16)
          .padStart(2, "0")) as unknown as SerializeTransportKeyPairReturnType["publicKey"],
      privateKey: PRIVATE_KEY as unknown as SerializeTransportKeyPairReturnType["privateKey"],
    };
  });
}

/** A generator whose round trip stays open until `release()` is called. */
export function makeGatedGenerator(): { generator: Generator; release: () => void } {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const generator = vi.fn().mockImplementation(async () => {
    await gate;
    return {
      publicKey: PUBLIC_KEY,
      privateKey: PRIVATE_KEY,
    } as unknown as SerializeTransportKeyPairReturnType;
  });
  return { generator, release };
}

export interface MakeVaultOptions {
  storage?: GenericStorage;
  generator?: Generator;
  logger?: MockLogger;
  scope?: string;
  secret?: string | Uint8Array;
}

/** A vault on the shared TTL, with a fresh storage/generator/logger unless one is supplied. */
export function makeVault({
  storage = new MemoryStorage(),
  generator = makeGenerator(),
  logger = makeLogger(),
  scope,
  secret,
}: MakeVaultOptions = {}): TransportKeyPairVault {
  return new TransportKeyPairVault({
    generator,
    storage,
    ttl: TTL_SECONDS,
    logger,
    scope,
    derivationSecret: secret === undefined ? undefined : holder(secret),
  });
}
