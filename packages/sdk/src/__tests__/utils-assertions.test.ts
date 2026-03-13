import { describe, it, expect, afterEach } from "../test-fixtures";
import { assertObject, assertString, assertArray, getBrowserExtensionRuntime } from "../utils";

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

describe("getBrowserExtensionRuntime", () => {
  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).chrome;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).browser;
  });

  it("returns undefined when neither chrome nor browser exists", () => {
    expect(getBrowserExtensionRuntime()).toBeUndefined();
  });

  it("returns runtime when chrome.runtime is valid", () => {
    const getURL = (p: string) => `chrome-extension://abc/${p}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).chrome = { runtime: { id: "abc", getURL } };
    const result = getBrowserExtensionRuntime();
    expect(result).toEqual({ id: "abc", getURL });
  });

  it("returns runtime when browser.runtime is valid", () => {
    const getURL = (p: string) => `moz-extension://def/${p}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).browser = { runtime: { id: "def", getURL } };
    const result = getBrowserExtensionRuntime();
    expect(result).toEqual({ id: "def", getURL });
  });

  it("falls back to browser.runtime when chrome.runtime is incomplete", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).chrome = { runtime: { id: "abc" } };
    const getURL = (p: string) => `moz-extension://def/${p}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).browser = { runtime: { id: "def", getURL } };
    const result = getBrowserExtensionRuntime();
    expect(result).toEqual({ id: "def", getURL });
  });

  it("returns undefined when chrome exists but has no runtime", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).chrome = {};
    expect(getBrowserExtensionRuntime()).toBeUndefined();
  });

  it("returns undefined when runtime.id is not a string", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).chrome = { runtime: { id: 123, getURL: () => "" } };
    expect(getBrowserExtensionRuntime()).toBeUndefined();
  });

  it("returns undefined when runtime.getURL is not a function", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).chrome = { runtime: { id: "abc", getURL: "not-a-fn" } };
    expect(getBrowserExtensionRuntime()).toBeUndefined();
  });
});
