import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { Relayer, type RelayerService } from "../../services/Relayer";
import { Signer } from "../../services/Signer";
import { CredentialStorage, SessionStorage } from "../../services/Storage";
import { EventEmitter, type EventEmitterService } from "../../services/EventEmitter";
import { SigningRejected } from "../../errors";
import { allow, create, isExpired, revoke, isAllowed, clear, computeStoreKey } from "../index";
import type { Hex, EIP712TypedData } from "../../relayer/relayer-sdk.types";

// ── Test helpers ───────────────────────────────────────────

const TEST_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as const;
const TEST_CHAIN_ID = 1;
const TEST_PUBLIC_KEY = "test-public-key";
const TEST_PRIVATE_KEY = "test-private-key";
const TEST_SIGNATURE = "0xdeadbeef" as Hex;

const makeMemoryStore = () => {
  const store = new Map<string, unknown>();
  return {
    get: (key: string) => Effect.succeed(store.get(key) ?? null),
    set: (key: string, value: unknown) =>
      Effect.sync(() => {
        store.set(key, value);
      }),
    delete: (key: string) =>
      Effect.sync(() => {
        store.delete(key);
      }),
    _store: store,
  };
};

const TEST_EIP712: EIP712TypedData = {
  domain: { name: "test", version: "1", chainId: 1, verifyingContract: TEST_ADDRESS },
  types: { Reencrypt: [] },
  primaryType: "Reencrypt",
  message: {
    publicKey: TEST_PUBLIC_KEY,
    contractAddresses: [TEST_ADDRESS],
    startTimestamp: 0n,
    durationDays: 1n,
    extraData: "",
  },
};

const makeTestRelayer = (): RelayerService => ({
  encrypt: () => Effect.succeed({ handles: [], inputProof: new Uint8Array() }),
  userDecrypt: () => Effect.succeed({}),
  publicDecrypt: () =>
    Effect.succeed({
      clearValues: {},
      abiEncodedClearValues: "0x" as Hex,
      decryptionProof: "0x" as Hex,
    }),
  generateKeypair: () =>
    Effect.succeed({ publicKey: TEST_PUBLIC_KEY, privateKey: TEST_PRIVATE_KEY }),
  createEIP712: () => Effect.succeed(TEST_EIP712),
  createDelegatedUserDecryptEIP712: () => Effect.die("not implemented"),
  delegatedUserDecrypt: () => Effect.succeed({}),
  requestZKProofVerification: () => Effect.die("not implemented"),
  getPublicKey: () => Effect.succeed(null),
  getPublicParams: () => Effect.succeed(null),
});

const makeTestSigner = () => ({
  getAddress: () => Effect.succeed(TEST_ADDRESS),
  getChainId: () => Effect.succeed(TEST_CHAIN_ID),
  signTypedData: () => Effect.succeed(TEST_SIGNATURE),
  readContract: () => Effect.die("not implemented"),
  writeContract: () => Effect.die("not implemented"),
  waitForTransactionReceipt: () => Effect.die("not implemented"),
});

const makeTestEmitter = (): EventEmitterService => ({
  emit: () => Effect.void,
});

function provideAll<A, E>(
  effect: Effect.Effect<A, E, Relayer | Signer | CredentialStorage | SessionStorage | EventEmitter>,
  overrides?: {
    relayer?: RelayerService;
    signer?: ReturnType<typeof makeTestSigner>;
    credentialStorage?: ReturnType<typeof makeMemoryStore>;
    sessionStorage?: ReturnType<typeof makeMemoryStore>;
    emitter?: EventEmitterService;
  },
) {
  return effect.pipe(
    Effect.provideService(Relayer, overrides?.relayer ?? makeTestRelayer()),
    Effect.provideService(Signer, overrides?.signer ?? makeTestSigner()),
    Effect.provideService(CredentialStorage, overrides?.credentialStorage ?? makeMemoryStore()),
    Effect.provideService(SessionStorage, overrides?.sessionStorage ?? makeMemoryStore()),
    Effect.provideService(EventEmitter, overrides?.emitter ?? makeTestEmitter()),
  );
}

function provideSignerAndStorage<A, E>(
  effect: Effect.Effect<A, E, Signer | CredentialStorage | SessionStorage>,
  overrides?: {
    signer?: ReturnType<typeof makeTestSigner>;
    credentialStorage?: ReturnType<typeof makeMemoryStore>;
    sessionStorage?: ReturnType<typeof makeMemoryStore>;
  },
) {
  return effect.pipe(
    Effect.provideService(Signer, overrides?.signer ?? makeTestSigner()),
    Effect.provideService(CredentialStorage, overrides?.credentialStorage ?? makeMemoryStore()),
    Effect.provideService(SessionStorage, overrides?.sessionStorage ?? makeMemoryStore()),
  );
}

// ── Tests ──────────────────────────────────────────────────

describe("computeStoreKey", () => {
  it("returns consistent hash for same input", async () => {
    const key1 = await computeStoreKey(TEST_ADDRESS, TEST_CHAIN_ID);
    const key2 = await computeStoreKey(TEST_ADDRESS, TEST_CHAIN_ID);
    expect(key1).toBe(key2);
    expect(key1).toHaveLength(32);
  });

  it("returns different hash for different inputs", async () => {
    const key1 = await computeStoreKey(TEST_ADDRESS, 1);
    const key2 = await computeStoreKey(TEST_ADDRESS, 2);
    expect(key1).not.toBe(key2);
  });

  it("is case-insensitive on address", async () => {
    const key1 = await computeStoreKey(TEST_ADDRESS.toLowerCase(), TEST_CHAIN_ID);
    const key2 = await computeStoreKey(TEST_ADDRESS.toUpperCase(), TEST_CHAIN_ID);
    expect(key1).toBe(key2);
  });
});

describe("create", () => {
  it("generates keypair, creates EIP712, signs, and returns credentials", async () => {
    const creds = await Effect.runPromise(provideAll(create([TEST_ADDRESS], 86400, 2592000)));

    expect(creds.publicKey).toBe(TEST_PUBLIC_KEY);
    expect(creds.privateKey).toBe(TEST_PRIVATE_KEY);
    expect(creds.signature).toBe(TEST_SIGNATURE);
    expect(creds.contractAddresses).toEqual([TEST_ADDRESS]);
    expect(creds.durationDays).toBe(1);
    expect(creds.startTimestamp).toBeGreaterThan(0);
  });

  it("stores session entry after signing", async () => {
    const sessionStorage = makeMemoryStore();
    await Effect.runPromise(provideAll(create([TEST_ADDRESS], 86400, 2592000), { sessionStorage }));

    // Session should have been stored
    const storeKey = await computeStoreKey(TEST_ADDRESS.toLowerCase(), TEST_CHAIN_ID);
    expect(sessionStorage._store.has(storeKey)).toBe(true);
    const entry = sessionStorage._store.get(storeKey) as { signature: string; ttl: number };
    expect(entry.signature).toBe(TEST_SIGNATURE);
    expect(entry.ttl).toBe(2592000);
  });

  it("wraps signing rejection as SigningRejected", async () => {
    const signer = makeTestSigner();
    // Override signTypedData to reject
    (signer as Record<string, unknown>).signTypedData = () =>
      Effect.fail(new SigningRejected({ message: "User rejected the signature" }));

    const result = await Effect.runPromiseExit(
      provideAll(create([TEST_ADDRESS], 86400, 2592000), { signer }),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      const error = (result.cause as { _tag: string; error: { _tag: string } }).error;
      expect(error._tag).toBe("SigningRejected");
    }
  });

  it("emits CredentialsCreating and CredentialsCreated events", async () => {
    const events: string[] = [];
    const emitter = {
      emit: (event: { type: string }) =>
        Effect.sync(() => {
          events.push(event.type);
        }),
    };

    await Effect.runPromise(provideAll(create([TEST_ADDRESS], 86400, 2592000), { emitter }));

    expect(events).toContain("credentials:creating");
    expect(events).toContain("credentials:created");
  });
});

describe("allow", () => {
  it("returns fresh credentials when nothing is stored", async () => {
    const creds = await Effect.runPromise(
      provideAll(allow([TEST_ADDRESS], { keypairTTL: 86400, sessionTTL: 2592000 })),
    );

    expect(creds.publicKey).toBe(TEST_PUBLIC_KEY);
    expect(creds.privateKey).toBe(TEST_PRIVATE_KEY);
    expect(creds.signature).toBe(TEST_SIGNATURE);
    expect(creds.contractAddresses).toEqual([TEST_ADDRESS]);
  });

  it("returns cached credentials on second call", async () => {
    const credentialStorage = makeMemoryStore();
    const sessionStorage = makeMemoryStore();
    let callCount = 0;
    const relayer: RelayerService = {
      ...makeTestRelayer(),
      generateKeypair: () => {
        callCount++;
        return Effect.succeed({ publicKey: TEST_PUBLIC_KEY, privateKey: TEST_PRIVATE_KEY });
      },
    };

    const config = { keypairTTL: 86400, sessionTTL: 2592000 };
    const services = { relayer, credentialStorage, sessionStorage };

    // First call creates credentials
    const creds1 = await Effect.runPromise(provideAll(allow([TEST_ADDRESS], config), services));
    expect(callCount).toBe(1);

    // Second call should return cached
    const creds2 = await Effect.runPromise(provideAll(allow([TEST_ADDRESS], config), services));
    expect(callCount).toBe(1); // No new keypair generated
    expect(creds2.publicKey).toBe(creds1.publicKey);
  });

  it("emits CredentialsLoading and CredentialsAllowed events", async () => {
    const events: string[] = [];
    const emitter = {
      emit: (event: { type: string }) =>
        Effect.sync(() => {
          events.push(event.type);
        }),
    };

    await Effect.runPromise(
      provideAll(allow([TEST_ADDRESS], { keypairTTL: 86400, sessionTTL: 2592000 }), { emitter }),
    );

    expect(events).toContain("credentials:loading");
    expect(events).toContain("credentials:allowed");
  });
});

describe("revoke", () => {
  it("deletes session entry", async () => {
    const sessionStorage = makeMemoryStore();
    const credentialStorage = makeMemoryStore();

    // First create credentials to populate session
    await Effect.runPromise(
      provideAll(create([TEST_ADDRESS], 86400, 2592000), { sessionStorage, credentialStorage }),
    );

    const storeKey = await computeStoreKey(TEST_ADDRESS.toLowerCase(), TEST_CHAIN_ID);
    expect(sessionStorage._store.has(storeKey)).toBe(true);

    // Revoke
    await Effect.runPromise(
      revoke(TEST_ADDRESS).pipe(
        Effect.provideService(Signer, makeTestSigner()),
        Effect.provideService(SessionStorage, sessionStorage),
        Effect.provideService(EventEmitter, makeTestEmitter()),
      ),
    );

    expect(sessionStorage._store.has(storeKey)).toBe(false);
  });

  it("emits CredentialsRevoked event", async () => {
    const events: { type: string; contractAddresses?: string[] }[] = [];
    const emitter = {
      emit: (event: { type: string; contractAddresses?: string[] }) =>
        Effect.sync(() => {
          events.push(event);
        }),
    };

    await Effect.runPromise(
      revoke(TEST_ADDRESS).pipe(
        Effect.provideService(Signer, makeTestSigner()),
        Effect.provideService(SessionStorage, makeMemoryStore()),
        Effect.provideService(EventEmitter, emitter),
      ),
    );

    expect(events.some((e) => e.type === "credentials:revoked")).toBe(true);
  });
});

describe("isAllowed", () => {
  it("returns false when no session exists", async () => {
    const result = await Effect.runPromise(
      isAllowed().pipe(
        Effect.provideService(Signer, makeTestSigner()),
        Effect.provideService(SessionStorage, makeMemoryStore()),
      ),
    );
    expect(result).toBe(false);
  });

  it("returns true when a valid session exists", async () => {
    const sessionStorage = makeMemoryStore();

    // Create credentials to populate session
    await Effect.runPromise(provideAll(create([TEST_ADDRESS], 86400, 2592000), { sessionStorage }));

    const result = await Effect.runPromise(
      isAllowed().pipe(
        Effect.provideService(Signer, makeTestSigner()),
        Effect.provideService(SessionStorage, sessionStorage),
      ),
    );
    expect(result).toBe(true);
  });

  it("returns false when session is expired", async () => {
    const sessionStorage = makeMemoryStore();
    const storeKey = await computeStoreKey(TEST_ADDRESS.toLowerCase(), TEST_CHAIN_ID);

    // Store an expired session entry (createdAt in the past, ttl=1)
    sessionStorage._store.set(storeKey, {
      signature: TEST_SIGNATURE,
      createdAt: Math.floor(Date.now() / 1000) - 100,
      ttl: 1,
    });

    const result = await Effect.runPromise(
      isAllowed().pipe(
        Effect.provideService(Signer, makeTestSigner()),
        Effect.provideService(SessionStorage, sessionStorage),
      ),
    );
    expect(result).toBe(false);
  });
});

describe("isExpired", () => {
  it("returns false when no credentials are stored", async () => {
    const result = await Effect.runPromise(
      isExpired().pipe(
        Effect.provideService(Signer, makeTestSigner()),
        Effect.provideService(CredentialStorage, makeMemoryStore()),
      ),
    );
    expect(result).toBe(false);
  });
});

describe("clear", () => {
  it("deletes both credential and session storage", async () => {
    const credentialStorage = makeMemoryStore();
    const sessionStorage = makeMemoryStore();

    // Create credentials to populate both stores
    await Effect.runPromise(
      provideAll(create([TEST_ADDRESS], 86400, 2592000), { credentialStorage, sessionStorage }),
    );

    const storeKey = await computeStoreKey(TEST_ADDRESS.toLowerCase(), TEST_CHAIN_ID);
    expect(sessionStorage._store.has(storeKey)).toBe(true);

    await Effect.runPromise(
      provideSignerAndStorage(clear(), { credentialStorage, sessionStorage }),
    );

    expect(sessionStorage._store.has(storeKey)).toBe(false);
    expect(credentialStorage._store.has(storeKey)).toBe(false);
  });
});
