import { describe, expect, it, vi } from "vitest";
import { getAddress, type Address, type Hex } from "viem";
import type { Handle, ClearValueType } from "../../relayer/relayer-sdk.types";
import type { DecryptCache } from "../../decrypt-cache";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { DelegatedCredentialsManager } from "../../credentials/delegated-credentials-manager";
import { DecryptionFailedError } from "../../errors";
import {
  runDelegatedDecryptPipeline,
  type DelegatedDecryptDeps,
} from "../delegated-user-decrypt-pipeline";

const OWNER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
const DELEGATE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const CONTRACT_A = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as Address;
const CONTRACT_B = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" as Address;
const HANDLE_1 = ("0x" + "01".repeat(32)) as Handle;
const HANDLE_2 = ("0x" + "02".repeat(32)) as Handle;

const MOCK_DELEGATED_CREDS = {
  publicKey: "0xpub" as Hex,
  privateKey: "0xpriv" as Hex,
  signature: "0xsig" as Hex,
  contractAddresses: [getAddress(CONTRACT_A)],
  startTimestamp: 1000,
  durationDays: 1,
  delegatorAddress: DELEGATOR,
  delegateAddress: DELEGATE,
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
    delegatedDecryptResult?: Record<string, ClearValueType>;
  } = {},
): DelegatedDecryptDeps {
  const cache = overrides.cache ?? createMockCache();
  const decryptResult = overrides.delegatedDecryptResult ?? {
    [HANDLE_1]: 100n,
  };

  return {
    delegatedCredentials: {
      allow: vi.fn().mockResolvedValue(MOCK_DELEGATED_CREDS),
    } as unknown as DelegatedCredentialsManager,
    relayer: {
      delegatedUserDecrypt: vi.fn().mockResolvedValue(decryptResult),
    } as unknown as RelayerSDK,
    cache,
  };
}

describe("runDelegatedDecryptPipeline", () => {
  it("returns empty record for empty handles", async () => {
    const deps = createDeps();
    const result = await runDelegatedDecryptPipeline(
      { handles: [], delegatorAddress: DELEGATOR },
      deps,
    );

    expect(result).toEqual({});
    expect(deps.delegatedCredentials.allow).not.toHaveBeenCalled();
    expect(deps.relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
  });

  it("returns cached values without calling relayer", async () => {
    const store = new Map<string, ClearValueType>();
    store.set(`${getAddress(CONTRACT_A)}:${HANDLE_1}`, 42n);

    const cache = createMockCache(store);
    const deps = createDeps({ cache });

    const result = await runDelegatedDecryptPipeline(
      {
        handles: [{ handle: HANDLE_1, contractAddress: CONTRACT_A }],
        delegatorAddress: DELEGATOR,
      },
      deps,
    );

    expect(result[HANDLE_1]).toBe(42n);
    expect(deps.relayer.delegatedUserDecrypt).not.toHaveBeenCalled();
    expect(deps.delegatedCredentials.allow).not.toHaveBeenCalled();
  });

  it("decrypts uncached handles via relayer and caches results", async () => {
    const cache = createMockCache();
    const deps = createDeps({
      cache,
      delegatedDecryptResult: { [HANDLE_1]: 100n },
    });

    const result = await runDelegatedDecryptPipeline(
      {
        handles: [{ handle: HANDLE_1, contractAddress: CONTRACT_A }],
        delegatorAddress: DELEGATOR,
      },
      deps,
    );

    expect(result[HANDLE_1]).toBe(100n);
    expect(deps.delegatedCredentials.allow).toHaveBeenCalledWith(DELEGATOR, getAddress(CONTRACT_A));
    expect(deps.relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith(
      DELEGATOR, // ownerAddress defaults to delegatorAddress
      getAddress(CONTRACT_A),
      HANDLE_1,
      100n,
    );
  });

  it("uses explicit ownerAddress for cache when provided", async () => {
    const cache = createMockCache();
    const deps = createDeps({
      cache,
      delegatedDecryptResult: { [HANDLE_1]: 100n },
    });

    await runDelegatedDecryptPipeline(
      {
        handles: [{ handle: HANDLE_1, contractAddress: CONTRACT_A }],
        delegatorAddress: DELEGATOR,
        ownerAddress: OWNER,
      },
      deps,
    );

    expect(cache.set).toHaveBeenCalledWith(OWNER, getAddress(CONTRACT_A), HANDLE_1, 100n);
  });

  it("groups handles by contract for separate relayer calls", async () => {
    const deps = createDeps();
    vi.mocked(deps.relayer.delegatedUserDecrypt)
      .mockResolvedValueOnce({ [HANDLE_1]: 10n })
      .mockResolvedValueOnce({ [HANDLE_2]: 20n });

    const result = await runDelegatedDecryptPipeline(
      {
        handles: [
          { handle: HANDLE_1, contractAddress: CONTRACT_A },
          { handle: HANDLE_2, contractAddress: CONTRACT_B },
        ],
        delegatorAddress: DELEGATOR,
      },
      deps,
    );

    expect(result[HANDLE_1]).toBe(10n);
    expect(result[HANDLE_2]).toBe(20n);
    expect(deps.relayer.delegatedUserDecrypt).toHaveBeenCalledTimes(2);
  });

  it("throws DecryptionFailedError when relayer omits a handle", async () => {
    const deps = createDeps({
      delegatedDecryptResult: {}, // missing HANDLE_1
    });

    await expect(
      runDelegatedDecryptPipeline(
        {
          handles: [{ handle: HANDLE_1, contractAddress: CONTRACT_A }],
          delegatorAddress: DELEGATOR,
        },
        deps,
      ),
    ).rejects.toThrow(DecryptionFailedError);
  });

  it("tolerates cache.set failures gracefully", async () => {
    const cache = createMockCache();
    vi.mocked(cache.set).mockRejectedValue(new Error("storage full"));

    const deps = createDeps({
      cache,
      delegatedDecryptResult: { [HANDLE_1]: 100n },
    });

    const result = await runDelegatedDecryptPipeline(
      {
        handles: [{ handle: HANDLE_1, contractAddress: CONTRACT_A }],
        delegatorAddress: DELEGATOR,
      },
      deps,
    );

    expect(result[HANDLE_1]).toBe(100n);
  });
});
