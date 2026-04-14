import { describe, expect, it, vi } from "vitest";
import { getAddress, type Address, type Hex } from "viem";
import type { Handle, ClearValueType } from "../../relayer/relayer-sdk.types";
import type { DecryptCache } from "../../decrypt-cache";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { CredentialsManager } from "../../credentials/credentials-manager";
import type { GenericSigner } from "../../types";
import { DecryptionFailedError } from "../../errors";
import { runUserDecryptPipeline, type UserDecryptDeps } from "../user-decrypt-pipeline";

const OWNER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const CONTRACT_A = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as Address;
const CONTRACT_B = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" as Address;
const HANDLE_1 = ("0x" + "01".repeat(32)) as Handle;
const HANDLE_2 = ("0x" + "02".repeat(32)) as Handle;
const HANDLE_3 = ("0x" + "03".repeat(32)) as Handle;

const MOCK_CREDS = {
  publicKey: "0xpub" as Hex,
  privateKey: "0xpriv" as Hex,
  signature: "0xsig" as Hex,
  contractAddresses: [getAddress(CONTRACT_A)],
  startTimestamp: 1000,
  durationDays: 1,
};

function createMockCache(store: Map<string, ClearValueType> = new Map()): DecryptCache {
  return {
    get: vi.fn((_owner: Address, contract: Address, handle: Handle) =>
      Promise.resolve(store.get(`${contract}:${handle}`) ?? null),
    ),
    set: vi.fn(() => Promise.resolve()),
  } as unknown as DecryptCache;
}

function createDeps(
  overrides: {
    cache?: DecryptCache;
    userDecryptResult?: Record<string, ClearValueType>;
  } = {},
): UserDecryptDeps {
  const cache = overrides.cache ?? createMockCache();
  const decryptResult = overrides.userDecryptResult ?? {
    [HANDLE_1]: 100n,
    [HANDLE_2]: 200n,
  };

  return {
    signer: {
      getAddress: vi.fn().mockResolvedValue(OWNER),
    } as unknown as GenericSigner,
    credentials: {
      allow: vi.fn().mockResolvedValue(MOCK_CREDS),
    } as unknown as CredentialsManager,
    relayer: {
      userDecrypt: vi.fn().mockResolvedValue(decryptResult),
    } as unknown as RelayerSDK,
    cache,
  };
}

describe("runUserDecryptPipeline", () => {
  it("returns empty record for empty handles", async () => {
    const deps = createDeps();
    const result = await runUserDecryptPipeline([], deps);

    expect(result).toEqual({});
    expect(deps.credentials.allow).not.toHaveBeenCalled();
    expect(deps.relayer.userDecrypt).not.toHaveBeenCalled();
  });

  it("returns cached values without calling relayer", async () => {
    const store = new Map<string, ClearValueType>();
    store.set(`${getAddress(CONTRACT_A)}:${HANDLE_1}`, 42n);

    const cache = createMockCache(store);
    const deps = createDeps({ cache });

    const result = await runUserDecryptPipeline(
      [{ handle: HANDLE_1, contractAddress: CONTRACT_A }],
      deps,
    );

    expect(result[HANDLE_1]).toBe(42n);
    expect(deps.relayer.userDecrypt).not.toHaveBeenCalled();
    expect(deps.credentials.allow).not.toHaveBeenCalled();
  });

  it("decrypts uncached handles via relayer and caches results", async () => {
    const cache = createMockCache();
    const deps = createDeps({
      cache,
      userDecryptResult: { [HANDLE_1]: 100n },
    });

    const result = await runUserDecryptPipeline(
      [{ handle: HANDLE_1, contractAddress: CONTRACT_A }],
      deps,
    );

    expect(result[HANDLE_1]).toBe(100n);
    expect(deps.credentials.allow).toHaveBeenCalledWith(getAddress(CONTRACT_A));
    expect(deps.relayer.userDecrypt).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith(OWNER, getAddress(CONTRACT_A), HANDLE_1, 100n);
  });

  it("groups handles by contract and makes separate relayer calls", async () => {
    const deps = createDeps();
    vi.mocked(deps.relayer.userDecrypt)
      .mockResolvedValueOnce({ [HANDLE_1]: 10n })
      .mockResolvedValueOnce({ [HANDLE_2]: 20n });

    const result = await runUserDecryptPipeline(
      [
        { handle: HANDLE_1, contractAddress: CONTRACT_A },
        { handle: HANDLE_2, contractAddress: CONTRACT_B },
      ],
      deps,
    );

    expect(result[HANDLE_1]).toBe(10n);
    expect(result[HANDLE_2]).toBe(20n);
    expect(deps.relayer.userDecrypt).toHaveBeenCalledTimes(2);
  });

  it("passes all contract addresses to credentials.allow for stable dedup", async () => {
    const deps = createDeps();
    vi.mocked(deps.relayer.userDecrypt)
      .mockResolvedValueOnce({ [HANDLE_1]: 10n })
      .mockResolvedValueOnce({ [HANDLE_2]: 20n });

    await runUserDecryptPipeline(
      [
        { handle: HANDLE_1, contractAddress: CONTRACT_A },
        { handle: HANDLE_2, contractAddress: CONTRACT_B },
      ],
      deps,
    );

    expect(deps.credentials.allow).toHaveBeenCalledWith(
      getAddress(CONTRACT_A),
      getAddress(CONTRACT_B),
    );
  });

  it("throws DecryptionFailedError when relayer omits a handle", async () => {
    const deps = createDeps({
      userDecryptResult: {}, // missing HANDLE_1
    });

    await expect(
      runUserDecryptPipeline([{ handle: HANDLE_1, contractAddress: CONTRACT_A }], deps),
    ).rejects.toThrow(DecryptionFailedError);
  });

  it("does not call credentials when all handles are cached", async () => {
    const store = new Map<string, ClearValueType>();
    store.set(`${getAddress(CONTRACT_A)}:${HANDLE_1}`, 42n);

    const cache = createMockCache(store);
    const deps = createDeps({ cache });

    await runUserDecryptPipeline([{ handle: HANDLE_1, contractAddress: CONTRACT_A }], deps);

    expect(deps.credentials.allow).not.toHaveBeenCalled();
  });

  it("tolerates cache.set failures gracefully", async () => {
    const cache = createMockCache();
    vi.mocked(cache.set).mockRejectedValue(new Error("storage full"));

    const deps = createDeps({
      cache,
      userDecryptResult: { [HANDLE_1]: 100n },
    });

    const result = await runUserDecryptPipeline(
      [{ handle: HANDLE_1, contractAddress: CONTRACT_A }],
      deps,
    );

    expect(result[HANDLE_1]).toBe(100n);
  });

  it("mixes cached and uncached handles correctly", async () => {
    const store = new Map<string, ClearValueType>();
    store.set(`${getAddress(CONTRACT_A)}:${HANDLE_1}`, 10n);

    const cache = createMockCache(store);
    const deps = createDeps({ cache });
    vi.mocked(deps.relayer.userDecrypt).mockResolvedValueOnce({
      [HANDLE_2]: 20n,
      [HANDLE_3]: 30n,
    });

    const result = await runUserDecryptPipeline(
      [
        { handle: HANDLE_1, contractAddress: CONTRACT_A },
        { handle: HANDLE_2, contractAddress: CONTRACT_A },
        { handle: HANDLE_3, contractAddress: CONTRACT_A },
      ],
      deps,
    );

    expect(result[HANDLE_1]).toBe(10n); // from cache
    expect(result[HANDLE_2]).toBe(20n); // from relayer
    expect(result[HANDLE_3]).toBe(30n); // from relayer
  });

  it("returns 0n for zero handles without calling relayer", async () => {
    const zeroHandle =
      "0x0000000000000000000000000000000000000000000000000000000000000000" as Handle;
    const deps = createDeps();

    const result = await runUserDecryptPipeline(
      [{ handle: zeroHandle, contractAddress: CONTRACT_A }],
      deps,
    );

    expect(result[zeroHandle]).toBe(0n);
    expect(deps.signer.getAddress).not.toHaveBeenCalled();
    expect(deps.relayer.userDecrypt).not.toHaveBeenCalled();
  });

  it("mixes zero handles with real handles", async () => {
    const zeroHandle =
      "0x0000000000000000000000000000000000000000000000000000000000000000" as Handle;
    const deps = createDeps({ userDecryptResult: { [HANDLE_1]: 100n } });

    const result = await runUserDecryptPipeline(
      [
        { handle: zeroHandle, contractAddress: CONTRACT_A },
        { handle: HANDLE_1, contractAddress: CONTRACT_A },
      ],
      deps,
    );

    expect(result[zeroHandle]).toBe(0n);
    expect(result[HANDLE_1]).toBe(100n);
    expect(deps.relayer.userDecrypt).toHaveBeenCalledOnce();
  });

  it("includes zero-handle contract addresses in credentials.allow set", async () => {
    const zeroHandle =
      "0x0000000000000000000000000000000000000000000000000000000000000000" as Handle;
    const deps = createDeps({ userDecryptResult: { [HANDLE_1]: 100n } });

    await runUserDecryptPipeline(
      [
        { handle: zeroHandle, contractAddress: CONTRACT_B },
        { handle: HANDLE_1, contractAddress: CONTRACT_A },
      ],
      deps,
    );

    expect(deps.credentials.allow).toHaveBeenCalledWith(
      getAddress(CONTRACT_B),
      getAddress(CONTRACT_A),
    );
  });
});
