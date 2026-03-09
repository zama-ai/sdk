import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { Relayer, type RelayerService } from "../../../services/Relayer";
import { Signer, type SignerService } from "../../../services/Signer";
import { CredentialStorage, SessionStorage } from "../../../services/Storage";
import { EventEmitter, type EventEmitterService } from "../../../services/EventEmitter";
import type { Address, Handle, Hex, EIP712TypedData } from "../../../relayer/relayer-sdk.types";
import {
  isZeroHandle,
  ZERO_HANDLE,
  readConfidentialBalanceOfEffect,
  confidentialBalanceOfEffect,
  decryptBalanceEffect,
  balanceOfEffect,
  decryptHandlesEffect,
  isConfidentialEffect,
  isWrapperEffect,
  nameEffect,
  symbolEffect,
  decimalsEffect,
  underlyingTokenEffect,
  discoverWrapperEffect,
} from "../balance";

// ── Test constants ─────────────────────────────────────────

const TEST_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as Address;
const TEST_OWNER = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address;
const TEST_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000042" as Handle;
const TEST_SIGNATURE = "0xdeadbeef" as Hex;
const TEST_PUBLIC_KEY = "test-public-key";
const TEST_PRIVATE_KEY = "test-private-key";

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

// ── Mock factories ─────────────────────────────────────────

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

const makeGenericStorage = () => {
  const store = new Map<string, unknown>();
  return {
    get: async <T = unknown>(key: string): Promise<T | null> =>
      (store.get(key) as T | undefined) ?? null,
    set: async <T = unknown>(key: string, value: T): Promise<void> => {
      store.set(key, value);
    },
    delete: async (key: string): Promise<void> => {
      store.delete(key);
    },
    _store: store,
  };
};

const makeTestRelayer = (overrides?: Partial<RelayerService>): RelayerService => ({
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
  ...overrides,
});

const mockReadContract = (fn: () => Effect.Effect<unknown>): SignerService["readContract"] =>
  fn as SignerService["readContract"];

const makeTestSigner = (overrides?: Record<string, unknown>): SignerService => ({
  getAddress: () => Effect.succeed(TEST_OWNER),
  getChainId: () => Effect.succeed(1),
  signTypedData: () => Effect.succeed(TEST_SIGNATURE),
  readContract: mockReadContract(() => Effect.succeed(0n)),
  writeContract: () => Effect.die("not implemented"),
  waitForTransactionReceipt: () => Effect.die("not implemented"),
  ...(overrides?.readContract
    ? {
        ...overrides,
        readContract: mockReadContract(overrides.readContract as () => Effect.Effect<unknown>),
      }
    : overrides),
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

// ── Tests ──────────────────────────────────────────────────

describe("isZeroHandle", () => {
  it("returns true for ZERO_HANDLE", () => {
    expect(isZeroHandle(ZERO_HANDLE)).toBe(true);
  });

  it("returns true for 0x", () => {
    expect(isZeroHandle("0x")).toBe(true);
  });

  it("returns false for a non-zero handle", () => {
    expect(isZeroHandle(TEST_HANDLE)).toBe(false);
  });
});

describe("readConfidentialBalanceOf", () => {
  it("reads and normalizes the balance handle", async () => {
    const signer = makeTestSigner({
      readContract: () => Effect.succeed(66n), // 0x42
    });

    const result = await Effect.runPromise(
      readConfidentialBalanceOfEffect(TEST_ADDRESS, TEST_OWNER).pipe(
        Effect.provideService(Signer, signer),
      ),
    );

    // normalizeHandle(66n) should produce a 32-byte hex
    expect(result).toBe(TEST_HANDLE);
  });
});

describe("confidentialBalanceOf", () => {
  it("resolves owner from signer when not provided", async () => {
    const signer = makeTestSigner({
      readContract: () => Effect.succeed(0n),
    });

    const result = await Effect.runPromise(
      confidentialBalanceOfEffect(TEST_ADDRESS).pipe(Effect.provideService(Signer, signer)),
    );

    expect(result).toBe(ZERO_HANDLE);
  });
});

describe("decryptBalance", () => {
  it("returns 0n for zero handle without calling relayer", async () => {
    const storage = makeGenericStorage();
    const result = await Effect.runPromise(
      provideAll(
        decryptBalanceEffect(
          TEST_ADDRESS,
          ZERO_HANDLE as Handle,
          { keypairTTL: 86400, sessionTTL: 2592000 },
          storage,
        ),
      ),
    );

    expect(result).toBe(BigInt(0));
  });

  it("decrypts a non-zero handle via the relayer", async () => {
    const storage = makeGenericStorage();
    const relayer = makeTestRelayer({
      userDecrypt: () => Effect.succeed({ [TEST_HANDLE]: 42n }),
    });

    const result = await Effect.runPromise(
      provideAll(
        decryptBalanceEffect(
          TEST_ADDRESS,
          TEST_HANDLE,
          { keypairTTL: 86400, sessionTTL: 2592000 },
          storage,
        ),
        { relayer },
      ),
    );

    expect(result).toBe(42n);
  });

  it("emits DecryptStart and DecryptEnd events", async () => {
    const storage = makeGenericStorage();
    const events: string[] = [];
    const emitter: EventEmitterService = {
      emit: (event) =>
        Effect.sync(() => {
          events.push(event.type);
        }),
    };
    const relayer = makeTestRelayer({
      userDecrypt: () => Effect.succeed({ [TEST_HANDLE]: 10n }),
    });

    await Effect.runPromise(
      provideAll(
        decryptBalanceEffect(
          TEST_ADDRESS,
          TEST_HANDLE,
          { keypairTTL: 86400, sessionTTL: 2592000 },
          storage,
        ),
        { relayer, emitter },
      ),
    );

    expect(events).toContain("decrypt:start");
    expect(events).toContain("decrypt:end");
  });

  it("returns cached balance on second call", async () => {
    const storage = makeGenericStorage();
    let decryptCalls = 0;
    const relayer = makeTestRelayer({
      userDecrypt: () => {
        decryptCalls++;
        return Effect.succeed({ [TEST_HANDLE]: 99n });
      },
    });

    const config = { keypairTTL: 86400, sessionTTL: 2592000 };

    // First call: decrypts
    await Effect.runPromise(
      provideAll(decryptBalanceEffect(TEST_ADDRESS, TEST_HANDLE, config, storage), { relayer }),
    );
    expect(decryptCalls).toBe(1);

    // Second call: should use cache
    const result = await Effect.runPromise(
      provideAll(decryptBalanceEffect(TEST_ADDRESS, TEST_HANDLE, config, storage), { relayer }),
    );
    expect(result).toBe(99n);
    expect(decryptCalls).toBe(1); // no additional decrypt call
  });
});

describe("balanceOf", () => {
  it("returns 0n when the handle is zero", async () => {
    const storage = makeGenericStorage();
    const signer = makeTestSigner({
      readContract: () => Effect.succeed(0n),
    });

    const result = await Effect.runPromise(
      provideAll(
        balanceOfEffect(TEST_ADDRESS, { keypairTTL: 86400, sessionTTL: 2592000 }, storage),
        {
          signer,
        },
      ),
    );

    expect(result).toBe(BigInt(0));
  });

  it("reads handle and decrypts non-zero balance", async () => {
    const storage = makeGenericStorage();
    const signer = makeTestSigner({
      readContract: () => Effect.succeed(66n), // 0x42
    });
    const relayer = makeTestRelayer({
      userDecrypt: () => Effect.succeed({ [TEST_HANDLE]: 1000n }),
    });

    const result = await Effect.runPromise(
      provideAll(
        balanceOfEffect(TEST_ADDRESS, { keypairTTL: 86400, sessionTTL: 2592000 }, storage),
        {
          signer,
          relayer,
        },
      ),
    );

    expect(result).toBe(1000n);
  });
});

describe("decryptHandles", () => {
  it("returns 0n for zero handles without calling relayer", async () => {
    const result = await Effect.runPromise(
      provideAll(
        decryptHandlesEffect(TEST_ADDRESS, [ZERO_HANDLE as Handle], {
          keypairTTL: 86400,
          sessionTTL: 2592000,
        }),
      ),
    );

    expect(result.get(ZERO_HANDLE as Handle)).toBe(BigInt(0));
  });

  it("decrypts multiple non-zero handles", async () => {
    const handle2 = "0x0000000000000000000000000000000000000000000000000000000000000043" as Handle;
    const relayer = makeTestRelayer({
      userDecrypt: () =>
        Effect.succeed({
          [TEST_HANDLE]: 10n,
          [handle2]: 20n,
        }),
    });

    const result = await Effect.runPromise(
      provideAll(
        decryptHandlesEffect(TEST_ADDRESS, [TEST_HANDLE, handle2], {
          keypairTTL: 86400,
          sessionTTL: 2592000,
        }),
        { relayer },
      ),
    );

    expect(result.get(TEST_HANDLE)).toBe(10n);
    expect(result.get(handle2)).toBe(20n);
  });
});

describe("metadata reads", () => {
  it("isConfidential returns boolean", async () => {
    const signer = makeTestSigner({
      readContract: () => Effect.succeed(true),
    });

    const result = await Effect.runPromise(
      isConfidentialEffect(TEST_ADDRESS).pipe(Effect.provideService(Signer, signer)),
    );
    expect(result).toBe(true);
  });

  it("isWrapper returns boolean", async () => {
    const signer = makeTestSigner({
      readContract: () => Effect.succeed(false),
    });

    const result = await Effect.runPromise(
      isWrapperEffect(TEST_ADDRESS).pipe(Effect.provideService(Signer, signer)),
    );
    expect(result).toBe(false);
  });

  it("name reads token name", async () => {
    const signer = makeTestSigner({
      readContract: () => Effect.succeed("Wrapped USDC"),
    });

    const result = await Effect.runPromise(
      nameEffect(TEST_ADDRESS).pipe(Effect.provideService(Signer, signer)),
    );
    expect(result).toBe("Wrapped USDC");
  });

  it("symbol reads token symbol", async () => {
    const signer = makeTestSigner({
      readContract: () => Effect.succeed("cUSDC"),
    });

    const result = await Effect.runPromise(
      symbolEffect(TEST_ADDRESS).pipe(Effect.provideService(Signer, signer)),
    );
    expect(result).toBe("cUSDC");
  });

  it("decimals reads token decimals", async () => {
    const signer = makeTestSigner({
      readContract: () => Effect.succeed(6),
    });

    const result = await Effect.runPromise(
      decimalsEffect(TEST_ADDRESS).pipe(Effect.provideService(Signer, signer)),
    );
    expect(result).toBe(6);
  });

  it("underlyingToken reads underlying address", async () => {
    const signer = makeTestSigner({
      readContract: () => Effect.succeed(TEST_OWNER),
    });

    const result = await Effect.runPromise(
      underlyingTokenEffect(TEST_ADDRESS).pipe(Effect.provideService(Signer, signer)),
    );
    expect(result).toBe(TEST_OWNER);
  });

  it("discoverWrapper returns null when no wrapper exists", async () => {
    const coordinator = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
    const signer = makeTestSigner({
      readContract: () => Effect.succeed(false),
    });

    const result = await Effect.runPromise(
      discoverWrapperEffect(TEST_ADDRESS, coordinator).pipe(Effect.provideService(Signer, signer)),
    );
    expect(result).toBeNull();
  });
});
