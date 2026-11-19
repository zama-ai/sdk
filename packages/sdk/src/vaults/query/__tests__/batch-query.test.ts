import { describe, expect, test } from "../../../test-fixtures";
import { createVaultClient } from "../../client";
import { defineVault } from "../../config";
import type { Batch, OpenBatch } from "../../types";
import { batchQueryOptions, openBatchesQueryOptions } from "..";

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

  test("polls a dispatched batch for its settlement before the callback deadline", ({ sdk }) => {
    const dispatched = {
      ...BASE,
      state: "dispatched",
      dispatchedAt: 950n,
      cancelsAt: 1_950n,
      nextChangeAt: 1_950n,
    } as const;
    expect(intervalFor(sdk, dispatched)).toBe(15_000);
    expect(intervalFor(sdk, { ...dispatched, observedAt: 1_945n })).toBe(6_000);
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

describe("openBatchesQueryOptions refetch schedule", () => {
  const vault = defineVault({
    id: "alpha",
    chainId: 1,
    batchers: { deposit: BASE.batcher, redeem: BASE.batcher },
  });
  const open: OpenBatch = { ...BASE, vaultId: "alpha" };

  function openIntervalFor(sdk: Parameters<typeof createVaultClient>[0], read: OpenBatch[]) {
    const { refetchInterval } = openBatchesQueryOptions(createVaultClient(sdk), {
      vault,
      direction: "deposit",
    });
    if (typeof refetchInterval !== "function") {
      throw new TypeError("expected a refetch schedule");
    }
    return refetchInterval({ state: { data: read } } as never);
  }

  test("reads again one second after the soonest batch comes within the join margin", ({ sdk }) => {
    // Due at 1000, margin 60, observed at 900: 40 s until joins move on.
    const early = { ...open, observedAt: 900n };
    expect(openIntervalFor(sdk, [early, { ...early, dispatchableAt: 2_000n }])).toBe(41_000);
  });

  test("polls once a batch is within the margin, until a keeper dispatches it", ({ sdk }) => {
    expect(openIntervalFor(sdk, [open])).toBe(15_000);
  });

  test("follows the open vault when another is paused", ({ sdk }) => {
    expect(
      openIntervalFor(sdk, [
        { ...open, paused: true },
        { ...open, observedAt: 900n },
      ]),
    ).toBe(41_000);
  });

  test("stops while every vault is paused", ({ sdk }) => {
    expect(openIntervalFor(sdk, [{ ...open, paused: true }])).toBe(false);
  });
});
