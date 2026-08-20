import { describe, test, expect } from "../../test-fixtures";
import { KeyWrappingError, NoCiphertextError } from "..";
import { isFatalBatchError } from "../fatal-batch";

describe("isFatalBatchError", () => {
  test("returns true for KeyWrappingError", () => {
    expect(isFatalBatchError(new KeyWrappingError("wrap failed"))).toBe(true);
  });

  test("returns false for a non-fatal per-item error", () => {
    expect(isFatalBatchError(new NoCiphertextError("no ciphertext"))).toBe(false);
  });
});
