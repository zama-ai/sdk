import { describe, expect, test } from "../../../test-fixtures";
import { createVaultClient } from "../../client";
import type { Batch } from "../../types";
import { batchQueryOptions } from "..";

const BASE = {
  chainId: 1,
  batcher: "0xAaaAaAAaAaAAaAaAAaaAaaAaAaAAaAaAaAAAAaaA",
  batchId: 1n,
  createdAt: 900n,
  dispatchableAt: 1_000n,
  paused: false,
  deposit: null,
  actions: [],
  observedAt: 940n,
} as const;

function intervalFor(sdk: Parameters<typeof createVaultClient>[0], batch: Batch) {
  const { refetchInterval } = batchQueryOptions(createVaultClient(sdk), { batch });
  if (typeof refetchInterval !== "function") {
    throw new TypeError("expected a refetch schedule");
  }
  return refetchInterval({ state: { data: batch } } as never);
}

describe("batchQueryOptions refetch schedule", () => {
  test("reads again one second past the next chain-time edge", ({ sdk }) => {
    expect(intervalFor(sdk, { ...BASE, state: "pending", nextChangeAt: 1_000n })).toBe(61_000);
  });

  test("polls a pending batch that waits for a dispatch", ({ sdk }) => {
    expect(intervalFor(sdk, { ...BASE, state: "pending", nextChangeAt: null })).toBe(15_000);
  });

  test("stops once the batch settled", ({ sdk }) => {
    expect(
      intervalFor(sdk, {
        ...BASE,
        state: "canceled",
        dispatchedAt: 950n,
        cancelsAt: 1_950n,
        nextChangeAt: null,
      }),
    ).toBe(false);
  });
});
