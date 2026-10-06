import { describe, expect, test } from "vitest";
import type { RelayerRequestOptions } from "../relayer/types";
import {
  isTelemetryDisabledByEnv,
  telemetryHeaders,
  type TelemetryState,
  withOperation,
} from "../telemetry";
import { SDK_VERSION } from "../version";

describe("telemetryHeaders", () => {
  const telemetry = { state: { layer: "core" } as TelemetryState, runtime: "browser" as const };

  test("stamps the package version, layer, runtime and operation", () => {
    expect(telemetryHeaders(telemetry, "unshield")).toEqual({
      "x-zama-sdk-version": SDK_VERSION,
      "x-zama-sdk-layer": "core",
      "x-zama-sdk-runtime": "browser",
      "x-zama-sdk-operation": "unshield",
    });
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
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

describe("withOperation", () => {
  test("applies the default label and keeps the other options", () => {
    const options: RelayerRequestOptions = { timeout: 5 };
    expect(withOperation(options, "decrypt-values")).toEqual({
      timeout: 5,
      operation: "decrypt-values",
    });
    expect(withOperation(undefined, "decrypt-values")).toEqual({ operation: "decrypt-values" });
  });

  test("keeps a label the caller already set", () => {
    expect(withOperation({ operation: "balance-of" }, "decrypt-values")).toEqual({
      operation: "balance-of",
    });
  });
});
