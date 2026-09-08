import { describe, expect, test } from "../../test-fixtures";
import { ConfigurationError } from "../../errors";
import { web } from "../web";

// Only validation matters here.
describe("web()", () => {
  test("returns a web relayer config", () => {
    expect(web().type).toBe("web");
    expect(web({ offloadEncrypt: false }).type).toBe("web");
    expect(web({ offloadEncrypt: "auto" }).type).toBe("web");
    expect(web({ offloadEncrypt: true }).type).toBe("web");
  });

  test("rejects an invalid offloadEncrypt value at the factory boundary", () => {
    expect(() => web({ offloadEncrypt: "always" as never })).toThrow(ConfigurationError);
  });

  test("rejects an invalid offloadWorker value", () => {
    expect(() => web({ offloadWorker: 42 as never })).toThrow(ConfigurationError);
  });

  test("rejects an empty offloadWorker string", () => {
    expect(() => web({ offloadWorker: "" })).toThrow(ConfigurationError);
  });

  test("accepts a partial offloadTimeouts", () => {
    expect(web({ offloadTimeouts: {} }).type).toBe("web");
    expect(web({ offloadTimeouts: { spawn: 1 } }).type).toBe("web");
    expect(web({ offloadTimeouts: { init: 1 } }).type).toBe("web");
    expect(web({ offloadTimeouts: { spawn: 1, init: 2 } }).type).toBe("web");
  });

  test("rejects a non-positive offloadTimeouts deadline", () => {
    expect(() => web({ offloadTimeouts: { spawn: 0 } })).toThrow(ConfigurationError);
    expect(() => web({ offloadTimeouts: { spawn: -1 } })).toThrow(ConfigurationError);
    expect(() => web({ offloadTimeouts: { init: 0 } })).toThrow(ConfigurationError);
    expect(() => web({ offloadTimeouts: { init: -1 } })).toThrow(ConfigurationError);
  });

  test("rejects a non-numeric offloadTimeouts deadline", () => {
    expect(() => web({ offloadTimeouts: { spawn: "5000" as never } })).toThrow(ConfigurationError);
  });
});
