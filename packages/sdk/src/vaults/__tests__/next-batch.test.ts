import { getAddress } from "viem";
import { describe, expect, test } from "vitest";
import { JOIN_MARGIN_SECONDS, pickNextBatch, type BatcherOffer } from "../next-batch";

const NOW = 1_000n;
const LOW = getAddress("0x1111111111111111111111111111111111111111");
const HIGH = getAddress("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

const open = (batcher: typeof LOW, dueIn: bigint, blocked = false): BatcherOffer => ({
  status: "open",
  batcher,
  batchId: 1n,
  dispatchableAt: NOW + dueIn,
  blocked,
});

const pick = (...offers: BatcherOffer[]) => pickNextBatch(offers, NOW)?.batcher;

describe("pickNextBatch", () => {
  test("takes the batch due soonest, whatever its address", () => {
    expect(pick(open(LOW, 600n), open(HIGH, 100n))).toBe(HIGH);
  });

  test("breaks a tie on the lower address", () => {
    expect(pick(open(HIGH, 100n), open(LOW, 100n))).toBe(LOW);
  });

  test("passes over a batch due within the margin", () => {
    expect(pick(open(LOW, JOIN_MARGIN_SECONDS - 1n), open(HIGH, 600n))).toBe(HIGH);
    expect(pick(open(LOW, JOIN_MARGIN_SECONDS), open(HIGH, 600n))).toBe(LOW);
  });

  test("prefers a blocked batch over one due within the margin", () => {
    expect(pick(open(LOW, 10n), open(HIGH, 600n, true))).toBe(HIGH);
  });

  test("takes the soonest open batch when each is due within the margin", () => {
    expect(pick(open(HIGH, -5n), open(LOW, 10n))).toBe(HIGH);
  });

  test("falls back to a paused batcher, and to nothing when every batcher is closed", () => {
    const paused: BatcherOffer = {
      status: "paused",
      batcher: HIGH,
      batchId: 1n,
      dispatchableAt: NOW,
    };
    const closed: BatcherOffer = { status: "closed", batcher: LOW };
    expect(pickNextBatch([closed, paused], NOW)).toBe(paused);
    expect(pickNextBatch([closed], NOW)).toBeUndefined();
  });
});
