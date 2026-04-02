import { describe, it, expect } from "../../test-fixtures";
import { toError, isContractCallError } from "../error";

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

describe("isContractCallError", () => {
  it("detects viem ContractFunctionExecutionError", () => {
    const err = new Error("contract call failed");
    err.name = "ContractFunctionExecutionError";
    expect(isContractCallError(err)).toBe(true);
  });

  it("detects viem ContractFunctionRevertedError", () => {
    const err = new Error("contract reverted");
    err.name = "ContractFunctionRevertedError";
    expect(isContractCallError(err)).toBe(true);
  });

  it("detects ethers CALL_EXCEPTION", () => {
    const err = Object.assign(new Error("call exception"), { code: "CALL_EXCEPTION" });
    expect(isContractCallError(err)).toBe(true);
  });

  it("detects execution reverted message", () => {
    expect(isContractCallError(new Error("execution reverted"))).toBe(true);
  });

  it("returns false for network errors", () => {
    expect(isContractCallError(new Error("fetch failed"))).toBe(false);
    expect(isContractCallError(new Error("connection refused"))).toBe(false);
    expect(isContractCallError(new Error("timeout"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isContractCallError("string")).toBe(false);
    expect(isContractCallError(null)).toBe(false);
    expect(isContractCallError(undefined)).toBe(false);
  });
});
