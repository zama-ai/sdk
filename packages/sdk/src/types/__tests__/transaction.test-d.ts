import { describe, expectTypeOf, test } from "vitest";
import type { Hex } from "viem";
import type { TransactionReceipt, TransactionResult, RawLog } from "../transaction";

describe("TransactionReceipt", () => {
  test("logs is readonly array of RawLog", () => {
    expectTypeOf<TransactionReceipt["logs"]>().toEqualTypeOf<readonly RawLog[]>();
  });
});

describe("TransactionResult", () => {
  test("txHash is Hex", () => {
    expectTypeOf<TransactionResult["txHash"]>().toEqualTypeOf<Hex>();
  });

  test("receipt is TransactionReceipt", () => {
    expectTypeOf<TransactionResult["receipt"]>().toEqualTypeOf<TransactionReceipt>();
  });
});
