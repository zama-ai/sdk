import { describe, expect, test } from "vitest";
import type { RelayerRequestOptions } from "../relayer/types";
import {
  parseTelemetryMode,
  telemetryRequestOptions,
  type TelemetryMode,
  withOperation,
} from "../telemetry";
import { SDK_VERSION } from "../version";

describe("telemetryRequestOptions", () => {
  const telemetry = (mode: Exclude<TelemetryMode, "off">) => ({
    state: { layer: "core" as const, mode },
    runtime: "web" as const,
    mode,
  });

  test("stamps the package version, layer, runtime and operation as headers", () => {
    expect(telemetryRequestOptions(telemetry("header"), "unshield")).toEqual({
      headers: {
        "x-zama-sdk-version": SDK_VERSION,
        "x-zama-sdk-layer": "core",
        "x-zama-sdk-runtime": "web",
        "x-zama-sdk-operation": "unshield",
      },
    });
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
  });

  test("stamps the same fields as query parameters in query mode", () => {
    expect(telemetryRequestOptions(telemetry("query"), "unshield")).toEqual({
      query: {
        zama_sdk_version: SDK_VERSION,
        zama_sdk_layer: "core",
        zama_sdk_runtime: "web",
        zama_sdk_operation: "unshield",
      },
    });
  });

  test("omits the operation when no SDK flow labelled the request", () => {
    expect(telemetryRequestOptions(telemetry("header"), undefined).headers).not.toHaveProperty(
      "x-zama-sdk-operation",
    );
    expect(telemetryRequestOptions(telemetry("query"), undefined).query).not.toHaveProperty(
      "zama_sdk_operation",
    );
  });
});

describe("parseTelemetryMode", () => {
  test.each(["0", "false", " FALSE ", "off", "OFF", false])("reads %j as off", (value) => {
    expect(parseTelemetryMode(value)).toBe("off");
  });

  test.each([
    ["header", "header"],
    [true, "header"],
    [" Query ", "query"],
  ])("reads %j as the %s mode", (value, mode) => {
    expect(parseTelemetryMode(value)).toBe(mode);
  });

  test.each(["1", "true", "", "yes", undefined])("leaves %j to the caller", (value) => {
    expect(parseTelemetryMode(value)).toBeUndefined();
  });

  // TypeScript rejects these values; JavaScript callers can still pass them.
  test.each([0, 1, null, {}])("leaves the non-string %j to the caller", (value) => {
    expect(parseTelemetryMode(value as never)).toBeUndefined();
  });
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
