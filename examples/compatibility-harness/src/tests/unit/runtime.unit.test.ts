import { afterEach, describe, expect, it } from "vitest";
import { isMockModeEnabled, mockModeNote } from "../../config/runtime.js";

const ORIGINAL_MOCK_MODE = process.env.HARNESS_MOCK_MODE;

afterEach(() => {
  if (ORIGINAL_MOCK_MODE === undefined) {
    delete process.env.HARNESS_MOCK_MODE;
    return;
  }
  process.env.HARNESS_MOCK_MODE = ORIGINAL_MOCK_MODE;
});

describe("config.runtime.isMockModeEnabled", () => {
  it("is disabled by default", () => {
    delete process.env.HARNESS_MOCK_MODE;
    expect(isMockModeEnabled()).toBe(false);
  });

  it("accepts true-like values", () => {
    process.env.HARNESS_MOCK_MODE = "true";
    expect(isMockModeEnabled()).toBe(true);
    process.env.HARNESS_MOCK_MODE = "1";
    expect(isMockModeEnabled()).toBe(true);
    process.env.HARNESS_MOCK_MODE = "yes";
    expect(isMockModeEnabled()).toBe(true);
    process.env.HARNESS_MOCK_MODE = "on";
    expect(isMockModeEnabled()).toBe(true);
  });

  it("rejects other values", () => {
    process.env.HARNESS_MOCK_MODE = "false";
    expect(isMockModeEnabled()).toBe(false);
    process.env.HARNESS_MOCK_MODE = "0";
    expect(isMockModeEnabled()).toBe(false);
  });

  it("returns a stable explanatory note", () => {
    expect(mockModeNote()).toContain("HARNESS_MOCK_MODE");
  });
});
