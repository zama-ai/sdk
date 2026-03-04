import { describe, it, expect } from "vitest";
import { convertToBigIntRecord } from "../convert";

describe("convertToBigIntRecord", () => {
  it("passes through bigint values unchanged", () => {
    const result = convertToBigIntRecord({ a: 42n, b: 0n });
    expect(result).toEqual({ a: 42n, b: 0n });
  });

  it("converts boolean true to 1n and false to 0n", () => {
    const result = convertToBigIntRecord({ t: true, f: false });
    expect(result).toEqual({ t: 1n, f: 0n });
  });

  it("converts string numbers to bigint", () => {
    const result = convertToBigIntRecord({ a: "123", b: "0" });
    expect(result).toEqual({ a: 123n, b: 0n });
  });

  it("converts number values to bigint", () => {
    const result = convertToBigIntRecord({ a: 99, b: 0 });
    expect(result).toEqual({ a: 99n, b: 0n });
  });

  it("handles mixed types in the same record", () => {
    const result = convertToBigIntRecord({
      big: 10n,
      bool: true,
      str: "42",
      num: 7,
    });
    expect(result).toEqual({ big: 10n, bool: 1n, str: 42n, num: 7n });
  });

  it("handles empty record", () => {
    const result = convertToBigIntRecord({});
    expect(result).toEqual({});
  });

  it("throws TypeError for unsupported value types", () => {
    expect(() => convertToBigIntRecord({ bad: undefined as unknown })).toThrow(TypeError);
    expect(() => convertToBigIntRecord({ bad: undefined as unknown })).toThrow(
      "Unexpected decrypted value type for handle bad",
    );
  });

  it("throws TypeError for object values", () => {
    expect(() => convertToBigIntRecord({ obj: {} as unknown })).toThrow(TypeError);
  });

  it("throws TypeError for null values", () => {
    expect(() => convertToBigIntRecord({ n: null as unknown })).toThrow(TypeError);
  });
});
