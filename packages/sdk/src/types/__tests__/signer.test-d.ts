import { describe, expectTypeOf, test } from "vitest";
import type { Address, Hex } from "viem";
import type {
  GenericSigner,
  WalletAccountChange,
  WalletAccountListener,
  WalletAccount,
  WalletAccountStore,
} from "../signer";
import type { TransactionReceipt } from "../transaction";
import type { GenericProvider } from "../provider";

describe("GenericSigner", () => {
  test("walletAccount exposes a synchronous observable account store", () => {
    expectTypeOf<GenericSigner["walletAccount"]>().toEqualTypeOf<WalletAccountStore>();
    expectTypeOf<ReturnType<GenericSigner["walletAccount"]["getSnapshot"]>>().toEqualTypeOf<
      WalletAccount | undefined
    >();
  });

  test("requireWalletAccount returns WalletAccount synchronously", () => {
    expectTypeOf<GenericSigner["requireWalletAccount"]>().returns.toEqualTypeOf<WalletAccount>();
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

  test("walletAccount.subscribe takes a wallet account listener", () => {
    expectTypeOf<WalletAccountStore["subscribe"]>().toEqualTypeOf<
      (onWalletAccountChange: WalletAccountListener) => () => void
    >();
  });
});

describe("WalletAccountListener", () => {
  test("is a function of WalletAccountChange returning void", () => {
    expectTypeOf<WalletAccountListener>().toEqualTypeOf<(change: WalletAccountChange) => void>();
  });
});

describe("WalletAccountChange", () => {
  test("previous and next are optional WalletAccount", () => {
    expectTypeOf<WalletAccountChange["previous"]>().toEqualTypeOf<WalletAccount | undefined>();
    expectTypeOf<WalletAccountChange["next"]>().toEqualTypeOf<WalletAccount | undefined>();
  });

  test("accepts connect shape (next only)", () => {
    expectTypeOf<{ next: { address: Address; chainId: number } }>().toExtend<WalletAccountChange>();
  });

  test("accepts disconnect shape (previous only)", () => {
    expectTypeOf<{
      previous: { address: Address; chainId: number };
    }>().toExtend<WalletAccountChange>();
  });
});
