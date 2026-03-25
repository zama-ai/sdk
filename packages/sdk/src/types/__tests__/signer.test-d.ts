import { describe, expectTypeOf, test } from "vitest";
import type { Address, Hex } from "viem";
import type { GenericSigner, SignerLifecycleCallbacks } from "../signer";
import type { TransactionReceipt } from "../transaction";

describe("GenericSigner", () => {
  test("getChainId returns Promise<number>", () => {
    expectTypeOf<GenericSigner["getChainId"]>().returns.toEqualTypeOf<Promise<number>>();
  });

  test("getAddress returns Promise<Address>", () => {
    expectTypeOf<ReturnType<GenericSigner["getAddress"]>>().toEqualTypeOf<Promise<Address>>();
  });

  test("signTypedData returns Promise<Hex>", () => {
    expectTypeOf<GenericSigner["signTypedData"]>().returns.toEqualTypeOf<Promise<Hex>>();
  });

  test("waitForTransactionReceipt returns Promise<TransactionReceipt>", () => {
    expectTypeOf<GenericSigner["waitForTransactionReceipt"]>().returns.toEqualTypeOf<
      Promise<TransactionReceipt>
    >();
  });

  test("getBlockTimestamp returns Promise<bigint>", () => {
    expectTypeOf<ReturnType<GenericSigner["getBlockTimestamp"]>>().toEqualTypeOf<Promise<bigint>>();
  });

  test("subscribe is optional", () => {
    expectTypeOf<GenericSigner["subscribe"]>().toEqualTypeOf<
      ((callbacks: SignerLifecycleCallbacks) => () => void) | undefined
    >();
  });
});

describe("SignerLifecycleCallbacks", () => {
  test("all callbacks are optional", () => {
    expectTypeOf<SignerLifecycleCallbacks["onDisconnect"]>().toEqualTypeOf<
      (() => void) | undefined
    >();
    expectTypeOf<SignerLifecycleCallbacks["onAccountChange"]>().toEqualTypeOf<
      ((newAddress: Address) => void) | undefined
    >();
    expectTypeOf<SignerLifecycleCallbacks["onChainChange"]>().toEqualTypeOf<
      ((newChainId: number) => void) | undefined
    >();
  });

  test("accepts empty object", () => {
    expectTypeOf<{}>().toExtend<SignerLifecycleCallbacks>();
  });
});
