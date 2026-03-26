import { describe, expectTypeOf, test } from "vitest";
import type { Hex } from "viem";
import type { UnshieldCallbacks, ShieldCallbacks, TransferCallbacks } from "../callbacks";

describe("UnshieldCallbacks", () => {
  test("all callbacks are optional", () => {
    expectTypeOf<{}>().toExtend<UnshieldCallbacks>();
  });

  test("onUnwrapSubmitted receives a tx hash", () => {
    expectTypeOf<NonNullable<UnshieldCallbacks["onUnwrapSubmitted"]>>().parameters.toEqualTypeOf<
      [Hex]
    >();
  });

  test("onFinalizing takes no arguments", () => {
    expectTypeOf<NonNullable<UnshieldCallbacks["onFinalizing"]>>().parameters.toEqualTypeOf<[]>();
  });
});

describe("ShieldCallbacks", () => {
  test("all callbacks are optional", () => {
    expectTypeOf<{}>().toExtend<ShieldCallbacks>();
  });

  test("onShieldSubmitted receives a tx hash", () => {
    expectTypeOf<NonNullable<ShieldCallbacks["onShieldSubmitted"]>>().parameters.toEqualTypeOf<
      [Hex]
    >();
  });
});

describe("TransferCallbacks", () => {
  test("all callbacks are optional", () => {
    expectTypeOf<{}>().toExtend<TransferCallbacks>();
  });

  test("onEncryptComplete takes no arguments", () => {
    expectTypeOf<NonNullable<TransferCallbacks["onEncryptComplete"]>>().parameters.toEqualTypeOf<
      []
    >();
  });

  test("onTransferSubmitted receives a tx hash", () => {
    expectTypeOf<NonNullable<TransferCallbacks["onTransferSubmitted"]>>().parameters.toEqualTypeOf<
      [Hex]
    >();
  });
});
