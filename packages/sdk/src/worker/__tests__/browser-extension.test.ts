import { describe, it, expect, afterEach } from "../../test-fixtures";
import { getBrowserExtensionRuntime } from "../browser-extension";

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
