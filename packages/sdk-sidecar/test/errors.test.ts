import { status } from "@grpc/grpc-js";
import { SigningFailedError, TransportKeyPairChangedError } from "@zama-fhe/sdk";
import { expect, test } from "vitest";
import { serviceError, SidecarError } from "../src/errors.js";

test("retains canonical SDK codes and messages without reclassifying signing failures", () => {
  const signature = serviceError(new SigningFailedError("Wallet unavailable"));
  expect(signature.code).toBe(status.FAILED_PRECONDITION);
  expect(signature.metadata.get("zama-error-code")).toEqual(["SIGNING_FAILED"]);
  expect(signature.metadata.get("zama-error-retryable")).toEqual(["false"]);
  expect(signature.details).toBe("Wallet unavailable");
  expect(
    serviceError(new TransportKeyPairChangedError("Key changed")).metadata.get("zama-error-code"),
  ).toEqual(["TRANSPORT_KEY_PAIR_CHANGED"]);
  const wrapped = new SigningFailedError("Signing failed", {
    cause: new SidecarError("TRANSPORT_FAILURE", status.UNAVAILABLE, "Disconnected"),
  });
  expect(serviceError(wrapped).metadata.get("zama-error-code")).toEqual(["SIGNING_FAILED"]);
  expect(serviceError(new Error("private implementation detail")).details).toBe(
    "Operation failed.",
  );
});

test("restores callback error classes used by SDK recovery and preserves retry metadata", async () => {
  const { callbackError } = await import("../src/callback-errors.js");
  const { RpcRateLimitError, InvalidTransportKeyPairError, SigningRejectedError, ZamaErrorCode } =
    await import("@zama-fhe/sdk");
  const throttled = callbackError({
    code: "RPC_RATE_LIMITED",
    message: "Try later",
    retryable: true,
    retryAfterSeconds: 7,
  });
  expect(throttled).toBeInstanceOf(RpcRateLimitError);
  expect(serviceError(throttled).metadata.get("zama-error-retry-after-seconds")).toEqual(["7"]);
  expect(serviceError(throttled).metadata.get("zama-error-retryable")).toEqual(["true"]);
  expect(
    callbackError({
      code: ZamaErrorCode.InvalidTransportKeyPair,
      message: "Rotated",
      retryable: false,
      retryAfterSeconds: undefined,
    }),
  ).toBeInstanceOf(InvalidTransportKeyPairError);
  expect(
    callbackError({
      code: "SIGNING_REJECTED",
      message: "Rejected",
      retryable: false,
      retryAfterSeconds: undefined,
    }),
  ).toBeInstanceOf(SigningRejectedError);
});
