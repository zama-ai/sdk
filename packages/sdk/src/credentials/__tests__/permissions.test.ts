import { describe, test, expect } from "../../test-fixtures";
import { checksum } from "../utils";
import { sortedUnion } from "../permissions";

const A = checksum("0x1111111111111111111111111111111111111111");
const B = checksum("0x2222222222222222222222222222222222222222");
const C = checksum("0x3333333333333333333333333333333333333333");

describe("sortedUnion", () => {
  test("deduplicates and sorts the union of two arrays", () => {
    expect(sortedUnion([B, A], [A, C])).toEqual([A, B, C]);
  });

  test("returns [] when both inputs are empty", () => {
    expect(sortedUnion([], [])).toEqual([]);
  });

  test("preserves a single input when the other is empty", () => {
    expect(sortedUnion([B, A], [])).toEqual([A, B]);
    expect(sortedUnion([], [B, A])).toEqual([A, B]);
  });
});
