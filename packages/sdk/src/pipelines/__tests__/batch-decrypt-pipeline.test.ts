import { describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import type { Handle, ClearValueType } from "../../relayer/relayer-sdk.types";
import type { DecryptCache } from "../../decrypt-cache";
import {
  ConfigurationError,
  DecryptionFailedError,
  SigningFailedError,
  SigningRejectedError,
} from "../../errors";
import { runBatchDecryptPipeline, type BatchDecryptArgs } from "../batch-decrypt-pipeline";

const OWNER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const TOKEN_A = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as Address;
const TOKEN_B = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" as Address;
const HANDLE_1 = ("0x" + "01".repeat(32)) as Handle;
const HANDLE_2 = ("0x" + "02".repeat(32)) as Handle;
const ZERO_HANDLE = ("0x" + "00".repeat(32)) as Handle;

function createMockCache(store: Map<string, ClearValueType> = new Map()): DecryptCache {
  return {
    get: vi.fn((_owner: Address, contract: Address, handle: Handle) =>
      Promise.resolve(store.get(`${contract}:${handle}`) ?? null),
    ),
    set: vi.fn(() => Promise.resolve()),
  } as unknown as DecryptCache;
}

function createArgs(overrides: Partial<BatchDecryptArgs> = {}): BatchDecryptArgs {
  return {
    handles: overrides.handles ?? [],
    ownerAddress: overrides.ownerAddress ?? OWNER,
    decrypt: overrides.decrypt ?? vi.fn().mockResolvedValue({}),
  };
}

describe("runBatchDecryptPipeline", () => {
  it("returns empty results for empty handles", async () => {
    const cache = createMockCache();
    const args = createArgs();
    const { results, errors } = await runBatchDecryptPipeline(args, { cache }, {});

    expect(results.size).toBe(0);
    expect(errors.size).toBe(0);
  });

  it("returns 0n for zero handles without calling decrypt", async () => {
    const cache = createMockCache();
    const decrypt = vi.fn();
    const args = createArgs({
      handles: [{ tokenAddress: TOKEN_A, handle: ZERO_HANDLE }],
      decrypt,
    });

    const { results } = await runBatchDecryptPipeline(args, { cache }, {});

    expect(results.get(TOKEN_A)).toBe(0n);
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("returns cached values without calling decrypt", async () => {
    const store = new Map<string, ClearValueType>();
    store.set(`${TOKEN_A}:${HANDLE_1}`, 500n);

    const cache = createMockCache(store);
    const decrypt = vi.fn();
    const args = createArgs({
      handles: [{ tokenAddress: TOKEN_A, handle: HANDLE_1 }],
      decrypt,
    });

    const { results } = await runBatchDecryptPipeline(args, { cache }, {});

    expect(results.get(TOKEN_A)).toBe(500n);
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("skips preFlightCheck when all handles are cached or zero", async () => {
    const store = new Map<string, ClearValueType>();
    store.set(`${TOKEN_A}:${HANDLE_1}`, 500n);

    const cache = createMockCache(store);
    const preFlightCheck = vi.fn();
    const args = createArgs({
      handles: [
        { tokenAddress: TOKEN_A, handle: HANDLE_1 },
        { tokenAddress: TOKEN_B, handle: ZERO_HANDLE },
      ],
    });

    await runBatchDecryptPipeline(args, { cache }, { preFlightCheck });

    expect(preFlightCheck).not.toHaveBeenCalled();
  });

  it("calls preFlightCheck when there are uncached handles", async () => {
    const cache = createMockCache();
    const preFlightCheck = vi.fn();
    const decrypt = vi.fn().mockResolvedValue({ [HANDLE_1]: 100n });
    const args = createArgs({
      handles: [{ tokenAddress: TOKEN_A, handle: HANDLE_1 }],
      decrypt,
    });

    await runBatchDecryptPipeline(args, { cache }, { preFlightCheck });

    expect(preFlightCheck).toHaveBeenCalled();
  });

  it("decrypts uncached handles and returns results", async () => {
    const cache = createMockCache();
    const decrypt = vi.fn().mockResolvedValue({
      [HANDLE_1]: 100n,
      [HANDLE_2]: 200n,
    });
    const args = createArgs({
      handles: [
        { tokenAddress: TOKEN_A, handle: HANDLE_1 },
        { tokenAddress: TOKEN_B, handle: HANDLE_2 },
      ],
      decrypt,
    });

    const { results, errors } = await runBatchDecryptPipeline(args, { cache }, {});

    expect(results.get(TOKEN_A)).toBe(100n);
    expect(results.get(TOKEN_B)).toBe(200n);
    expect(errors.size).toBe(0);
  });

  it("puts DecryptionFailedError in errors map when decrypt omits a handle", async () => {
    const cache = createMockCache();
    const decrypt = vi.fn().mockResolvedValue({}); // missing HANDLE_1
    const args = createArgs({
      handles: [{ tokenAddress: TOKEN_A, handle: HANDLE_1 }],
      decrypt,
    });

    const { results, errors } = await runBatchDecryptPipeline(args, { cache }, {});

    expect(results.has(TOKEN_A)).toBe(false);
    expect(errors.get(TOKEN_A)).toBeInstanceOf(DecryptionFailedError);
  });

  it.each([
    ["SigningRejectedError", new SigningRejectedError("rejected")],
    ["SigningFailedError", new SigningFailedError("failed")],
    ["ConfigurationError", new ConfigurationError("bad config")],
  ])("rethrows %s without recovery", async (_name, error) => {
    const cache = createMockCache();
    const decrypt = vi.fn().mockRejectedValue(error);
    const args = createArgs({
      handles: [{ tokenAddress: TOKEN_A, handle: HANDLE_1 }],
      decrypt,
    });

    await expect(runBatchDecryptPipeline(args, { cache }, {})).rejects.toThrow(
      error.constructor as typeof Error,
    );
  });

  it("recovers partial results from cache on generic error", async () => {
    const store = new Map<string, ClearValueType>();
    // Simulate: HANDLE_1 was cached by the pipeline before HANDLE_2 failed
    store.set(`${TOKEN_A}:${HANDLE_1}`, 100n);

    const cache = createMockCache(store);
    const decrypt = vi.fn().mockRejectedValue(new Error("partial failure"));
    const args = createArgs({
      handles: [
        { tokenAddress: TOKEN_A, handle: HANDLE_1 },
        { tokenAddress: TOKEN_B, handle: HANDLE_2 },
      ],
      decrypt,
    });

    const { results, errors } = await runBatchDecryptPipeline(args, { cache }, {});

    expect(results.get(TOKEN_A)).toBe(100n); // recovered from cache
    expect(errors.has(TOKEN_B)).toBe(true); // no recovery possible
  });

  it("uses onError callback for unrecoverable tokens on generic error", async () => {
    const cache = createMockCache();
    const decrypt = vi.fn().mockRejectedValue(new Error("boom"));
    const onError = vi.fn().mockReturnValue(0n);
    const args = createArgs({
      handles: [{ tokenAddress: TOKEN_A, handle: HANDLE_1 }],
      decrypt,
    });

    const { results, errors } = await runBatchDecryptPipeline(args, { cache }, { onError });

    expect(onError).toHaveBeenCalledWith(expect.any(Error), TOKEN_A);
    expect(results.get(TOKEN_A)).toBe(0n);
    expect(errors.size).toBe(0);
  });

  it("captures onError callback errors in the errors map", async () => {
    const cache = createMockCache();
    const decrypt = vi.fn().mockRejectedValue(new Error("boom"));
    const onError = vi.fn().mockImplementation(() => {
      throw new Error("callback failed");
    });
    const args = createArgs({
      handles: [{ tokenAddress: TOKEN_A, handle: HANDLE_1 }],
      decrypt,
    });

    const { errors } = await runBatchDecryptPipeline(args, { cache }, { onError });

    expect(errors.has(TOKEN_A)).toBe(true);
    expect(errors.get(TOKEN_A)?.message).toBe("callback failed");
  });

  it("mixes zero, cached, and uncached handles", async () => {
    const store = new Map<string, ClearValueType>();
    store.set(`${TOKEN_A}:${HANDLE_1}`, 42n);

    const cache = createMockCache(store);
    const tokenC = "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC" as Address;
    const decrypt = vi.fn().mockResolvedValue({ [HANDLE_2]: 99n });
    const args = createArgs({
      handles: [
        { tokenAddress: TOKEN_A, handle: HANDLE_1 }, // cached
        { tokenAddress: TOKEN_B, handle: ZERO_HANDLE }, // zero
        { tokenAddress: tokenC, handle: HANDLE_2 }, // uncached
      ],
      decrypt,
    });

    const { results } = await runBatchDecryptPipeline(args, { cache }, {});

    expect(results.get(TOKEN_A)).toBe(42n);
    expect(results.get(TOKEN_B)).toBe(0n);
    expect(results.get(tokenC)).toBe(99n);
  });
});
