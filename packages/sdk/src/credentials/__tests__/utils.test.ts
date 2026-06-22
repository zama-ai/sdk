import { describe, test, expect } from "../../test-fixtures";
import { checksum, normalizeAddresses } from "../utils";

const A_LOWER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const B_LOWER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const A_CHK = checksum(A_LOWER);
const B_CHK = checksum(B_LOWER);

describe("normalizeAddresses", () => {
  test("deduplicates and sorts checksummed", () => {
    expect(normalizeAddresses([B_LOWER, A_LOWER, A_LOWER])).toEqual([A_CHK, B_CHK]);
  });
});
