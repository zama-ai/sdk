import { expect, test } from "vitest";
import {
  address,
  clearValue,
  encryptedValue,
  unsignedInteger,
  safeInteger,
} from "../src/encoding.js";
import { ClearValue } from "../src/generated/zama/sdk/v1beta1/daemon.js";

test.each([-1, 0.5, NaN, Infinity, 4294967296])(
  "rejects an unrepresentable integer instead of truncating %s",
  (value) => {
    expect(() => unsignedInteger(value, "Timeout")).toThrow("unsigned 32-bit integer");
    expect(() => clearValue(value)).toThrow("unsigned 32-bit integer");
  },
);
test("uint32 extrema and explicit undefined remain distinct protobuf values", () => {
  for (const value of [0, 4294967295, undefined]) {
    const encoded = clearValue(value);
    expect(ClearValue.decode(ClearValue.encode(encoded).finish())).toEqual(encoded);
  }
  expect(clearValue(undefined)).not.toEqual(ClearValue.fromPartial({}));
});
test("wire identities and handles reject malformed lengths and unsafe chain IDs", () => {
  expect(() => address(new Uint8Array(19))).toThrow("20 bytes");
  expect(() => encryptedValue(new Uint8Array(31))).toThrow("32 bytes");
  expect(() => safeInteger(9007199254740992n, "Chain ID")).toThrow("safe integer range");
  expect(safeInteger(9007199254740991n, "Chain ID")).toBe(9007199254740991);
});
