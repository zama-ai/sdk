import { describe, expectTypeOf, test } from "vitest";
import type { Address, Hex } from "viem";
import type {
  GenericSigner,
  SignerIdentityChange,
  SignerIdentityListener,
  SignerIdentity,
} from "../signer";
import type { TransactionReceipt } from "../transaction";
import type { GenericProvider } from "../provider";

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
    expectTypeOf<GenericProvider["waitForTransactionReceipt"]>().returns.toEqualTypeOf<
      Promise<TransactionReceipt>
    >();
  });

  test("getBlockTimestamp returns Promise<bigint>", () => {
    expectTypeOf<ReturnType<GenericProvider["getBlockTimestamp"]>>().toEqualTypeOf<
      Promise<bigint>
    >();
  });

  test("subscribe is optional and takes a direct listener", () => {
    expectTypeOf<GenericSigner["subscribe"]>().toEqualTypeOf<
      ((onIdentityChange: SignerIdentityListener) => () => void) | undefined
    >();
  });
});

describe("SignerIdentityListener", () => {
  test("is a function of SignerIdentityChange returning void", () => {
    expectTypeOf<SignerIdentityListener>().toEqualTypeOf<(change: SignerIdentityChange) => void>();
  });
});

describe("SignerIdentityChange", () => {
  test("previous and next are optional SignerIdentity", () => {
    expectTypeOf<SignerIdentityChange["previous"]>().toEqualTypeOf<SignerIdentity | undefined>();
    expectTypeOf<SignerIdentityChange["next"]>().toEqualTypeOf<SignerIdentity | undefined>();
  });

  test("accepts connect shape (next only)", () => {
    expectTypeOf<{
      next: { address: Address; chainId: number };
    }>().toExtend<SignerIdentityChange>();
  });

  test("accepts disconnect shape (previous only)", () => {
    expectTypeOf<{
      previous: { address: Address; chainId: number };
    }>().toExtend<SignerIdentityChange>();
  });
});
