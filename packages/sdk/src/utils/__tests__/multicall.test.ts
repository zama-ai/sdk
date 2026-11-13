import { describe, expect, test, vi } from "vitest";
import type { GenericProvider } from "../../types";
import { readContracts } from "../multicall";

const read = {
  address: "0x2222222222222222222222222222222222222222",
  abi: [],
  functionName: "paused",
  args: [],
} as const;

describe("readContracts", () => {
  test("uses the provider's multicall when it has one", async () => {
    const provider = {
      multicall: vi.fn().mockResolvedValue([true, false]),
      readContract: vi.fn(),
    } as unknown as GenericProvider;
    expect(await readContracts(provider, [read, read], 1)).toStrictEqual([true, false]);
    expect(provider.multicall).toHaveBeenCalledWith({ calls: [read, read], chainId: 1 });
    expect(provider.readContract).not.toHaveBeenCalled();
  });

  test("reads one call at a time on the requested chain without it", async () => {
    const provider = {
      readContract: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    } as unknown as GenericProvider;
    expect(await readContracts(provider, [read, { ...read, chainId: 5 }], 1)).toStrictEqual([
      true,
      false,
    ]);
    expect(provider.readContract).toHaveBeenNthCalledWith(2, { ...read, chainId: 1 });
  });
});
