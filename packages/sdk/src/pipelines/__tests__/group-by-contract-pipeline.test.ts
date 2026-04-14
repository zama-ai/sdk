import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import type { Handle } from "../../relayer/relayer-sdk.types";
import { runGroupByContractPipeline } from "../group-by-contract-pipeline";

const CONTRACT_A = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as Address;
const CONTRACT_B = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" as Address;
const HANDLE_1 = ("0x" + "01".repeat(32)) as Handle;
const HANDLE_2 = ("0x" + "02".repeat(32)) as Handle;
const HANDLE_3 = ("0x" + "03".repeat(32)) as Handle;

describe("runGroupByContractPipeline", () => {
  it("returns empty map for empty input", () => {
    const result = runGroupByContractPipeline([]);
    expect(result.size).toBe(0);
  });

  it("groups handles by contract address", () => {
    const result = runGroupByContractPipeline([
      { handle: HANDLE_1, contractAddress: CONTRACT_A },
      { handle: HANDLE_2, contractAddress: CONTRACT_B },
      { handle: HANDLE_3, contractAddress: CONTRACT_A },
    ]);

    expect(result.size).toBe(2);
    expect(result.get(CONTRACT_A)).toEqual([HANDLE_1, HANDLE_3]);
    expect(result.get(CONTRACT_B)).toEqual([HANDLE_2]);
  });

  it("puts all handles under one contract when addresses match", () => {
    const result = runGroupByContractPipeline([
      { handle: HANDLE_1, contractAddress: CONTRACT_A },
      { handle: HANDLE_2, contractAddress: CONTRACT_A },
    ]);

    expect(result.size).toBe(1);
    expect(result.get(CONTRACT_A)).toEqual([HANDLE_1, HANDLE_2]);
  });
});
