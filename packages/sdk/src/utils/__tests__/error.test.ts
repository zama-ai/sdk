import { describe, it, expect } from "../../test-fixtures";
import { toError } from "../error";

describe("toError", () => {
  it("returns the same Error instance", () => {
    const err = new Error("original");
    expect(toError(err)).toBe(err);
  });

  it("wraps a string as an Error", () => {
    const result = toError("string error");
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("string error");
  });

  it("extracts message from object with message property", () => {
    const result = toError({ message: "User rejected", code: 4001 });
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("User rejected");
  });

  it("handles undefined", () => {
    const result = toError(undefined);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("undefined");
  });

  it("handles null", () => {
    const result = toError(null);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("null");
  });

  it("handles a number", () => {
    const result = toError(42);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("42");
  });
});
