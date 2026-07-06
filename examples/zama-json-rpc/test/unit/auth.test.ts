import { describe, expect, it } from "vitest";
import { isAuthorized } from "../../src/rpc/auth.js";

describe("isAuthorized", () => {
  it("allows any request when no apiKey is configured", () => {
    expect(isAuthorized({ headers: {} }, undefined)).toBe(true);
  });

  it("rejects a request with no Authorization header when an apiKey is configured", () => {
    expect(isAuthorized({ headers: {} }, "secret")).toBe(false);
  });

  it("rejects the wrong bearer token", () => {
    expect(isAuthorized({ headers: { authorization: "Bearer wrong" } }, "secret")).toBe(false);
  });

  it("accepts the correct bearer token", () => {
    expect(isAuthorized({ headers: { authorization: "Bearer secret" } }, "secret")).toBe(true);
  });
});
