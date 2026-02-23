import { describe, it, expect } from "vitest";
import { assertObject, assertString, assertArray } from "../utils";

describe("assertObject", () => {
  it("accepts a plain object", () => {
    expect(() => assertObject({ key: "value" }, "test")).not.toThrow();
  });

  it("accepts an empty object", () => {
    expect(() => assertObject({}, "test")).not.toThrow();
  });

  it("throws for null", () => {
    expect(() => assertObject(null, "ctx")).toThrow(TypeError);
    expect(() => assertObject(null, "ctx")).toThrow("ctx must be an object, got object");
  });

  it("throws for an array", () => {
    expect(() => assertObject([], "ctx")).toThrow(TypeError);
    expect(() => assertObject([], "ctx")).toThrow("ctx must be an object, got object");
  });

  it("throws for a string", () => {
    expect(() => assertObject("hello", "ctx")).toThrow("ctx must be an object, got string");
  });

  it("throws for a number", () => {
    expect(() => assertObject(42, "ctx")).toThrow("ctx must be an object, got number");
  });

  it("throws for undefined", () => {
    expect(() => assertObject(undefined, "ctx")).toThrow("ctx must be an object, got undefined");
  });
});

describe("assertString", () => {
  it("accepts a string", () => {
    expect(() => assertString("hello", "test")).not.toThrow();
  });

  it("accepts an empty string", () => {
    expect(() => assertString("", "test")).not.toThrow();
  });

  it("throws for a number", () => {
    expect(() => assertString(42, "ctx")).toThrow(TypeError);
    expect(() => assertString(42, "ctx")).toThrow("ctx must be a string, got number");
  });

  it("throws for null", () => {
    expect(() => assertString(null, "ctx")).toThrow("ctx must be a string, got object");
  });

  it("throws for undefined", () => {
    expect(() => assertString(undefined, "ctx")).toThrow("ctx must be a string, got undefined");
  });
});

describe("assertArray", () => {
  it("accepts an array", () => {
    expect(() => assertArray([1, 2, 3], "test")).not.toThrow();
  });

  it("accepts an empty array", () => {
    expect(() => assertArray([], "test")).not.toThrow();
  });

  it("throws for an object", () => {
    expect(() => assertArray({}, "ctx")).toThrow(TypeError);
    expect(() => assertArray({}, "ctx")).toThrow("ctx must be an array, got object");
  });

  it("throws for a string", () => {
    expect(() => assertArray("hello", "ctx")).toThrow("ctx must be an array, got string");
  });

  it("throws for null", () => {
    expect(() => assertArray(null, "ctx")).toThrow("ctx must be an array, got object");
  });

  it("throws for undefined", () => {
    expect(() => assertArray(undefined, "ctx")).toThrow("ctx must be an array, got undefined");
  });
});
