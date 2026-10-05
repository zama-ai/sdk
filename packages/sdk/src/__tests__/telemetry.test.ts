import { describe, expect, test } from "vitest";
import packageJson from "../../package.json";
import { isTelemetryDisabledByEnv, telemetryHeaders, type TelemetryState } from "../telemetry";
import { SDK_VERSION } from "../version";

describe("telemetryHeaders", () => {
  const telemetry = { state: { layer: "core" } as TelemetryState, runtime: "browser" as const };

  test("stamps the package version, layer, runtime and operation", () => {
    expect(telemetryHeaders(telemetry, "unshield")).toEqual({
      "x-zama-sdk-version": packageJson.version,
      "x-zama-sdk-layer": "core",
      "x-zama-sdk-runtime": "browser",
      "x-zama-sdk-operation": "unshield",
    });
    expect(SDK_VERSION).toBe(packageJson.version);
  });

  test("omits the operation header when no SDK flow labelled the request", () => {
    expect(telemetryHeaders(telemetry, undefined)).not.toHaveProperty("x-zama-sdk-operation");
  });
});

describe("isTelemetryDisabledByEnv", () => {
  test.each(["0", "false", " FALSE "])("treats ZAMA_SDK_TELEMETRY=%j as an opt-out", (value) => {
    expect(isTelemetryDisabledByEnv({ ZAMA_SDK_TELEMETRY: value })).toBe(true);
  });

  test.each(["1", "true", "", undefined])(
    "keeps telemetry on for ZAMA_SDK_TELEMETRY=%j",
    (value) => {
      expect(isTelemetryDisabledByEnv({ ZAMA_SDK_TELEMETRY: value })).toBe(false);
    },
  );
});
