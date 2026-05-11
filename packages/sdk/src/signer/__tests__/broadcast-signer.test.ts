import type { Address, Hex } from "viem";
import { describe, expect, test, vi } from "vitest";
import { SignerCapabilityError, WalletNotConnectedError } from "../../errors";
import type { EIP712TypedData } from "../../relayer/relayer-sdk.types";
import type { Broadcaster, WalletAccount } from "../../types";
import { BroadcastSigner } from "../broadcast-signer";
import { assertSignTransaction, assertWriteContract } from "../capabilities";

const ACCOUNT: WalletAccount = {
  address: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address,
  chainId: 31337,
};

function makeBroadcaster(overrides: Partial<Broadcaster> = {}): Broadcaster {
  return {
    signTransaction: vi.fn(async () => "0xsignedtx" as Hex),
    signTypedData: vi.fn(async () => "0xsignedtypeddata" as Hex),
    ...overrides,
  };
}

describe("BroadcastSigner", () => {
  test("exposes the configured wallet account immediately", () => {
    const signer = new BroadcastSigner({ account: ACCOUNT, broadcaster: makeBroadcaster() });
    expect(signer.walletAccount.getSnapshot()).toEqual(ACCOUNT);
    expect(signer.walletAccount.isReady()).toBe(true);
  });

  test("requireWalletAccount returns the static account", () => {
    const signer = new BroadcastSigner({ account: ACCOUNT, broadcaster: makeBroadcaster() });
    expect(signer.requireWalletAccount("op")).toEqual(ACCOUNT);
  });

  test("signTypedData delegates to the broadcaster", async () => {
    const broadcaster = makeBroadcaster();
    const signer = new BroadcastSigner({ account: ACCOUNT, broadcaster });
    const typedData = {
      domain: {},
      types: {},
      primaryType: "T",
      message: {},
    } as unknown as EIP712TypedData;
    const sig = await signer.signTypedData(typedData);
    expect(sig).toBe("0xsignedtypeddata");
    expect(broadcaster.signTypedData).toHaveBeenCalledWith(typedData);
  });

  test("signTransaction delegates to the broadcaster", async () => {
    const broadcaster = makeBroadcaster();
    const signer = new BroadcastSigner({ account: ACCOUNT, broadcaster });
    const signed = await signer.signTransaction("0xunsigned" as Hex);
    expect(signed).toBe("0xsignedtx");
    expect(broadcaster.signTransaction).toHaveBeenCalledWith("0xunsigned");
  });

  test("does not implement writeContract (capability bag enforces deferred path)", () => {
    const signer = new BroadcastSigner({ account: ACCOUNT, broadcaster: makeBroadcaster() });
    expect((signer as { writeContract?: unknown }).writeContract).toBeUndefined();
  });

  test("dispose is idempotent", () => {
    const signer = new BroadcastSigner({ account: ACCOUNT, broadcaster: makeBroadcaster() });
    signer.dispose();
    expect(() => signer.dispose()).not.toThrow();
  });
});

function captureThrown(fn: () => void): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("expected fn to throw");
}

describe("signer capability guards", () => {
  test("assertWriteContract throws SignerCapabilityError on broadcast-only signer", () => {
    const signer = new BroadcastSigner({ account: ACCOUNT, broadcaster: makeBroadcaster() });
    const err = captureThrown(() => assertWriteContract(signer, "confidentialTransfer"));
    expect(err).toBeInstanceOf(SignerCapabilityError);
    expect((err as SignerCapabilityError).capability).toBe("writeContract");
    expect((err as SignerCapabilityError).operation).toBe("confidentialTransfer");
  });

  test("assertSignTransaction is a no-op on a signer that exposes signTransaction", async () => {
    const broadcaster = makeBroadcaster();
    const signer = new BroadcastSigner({ account: ACCOUNT, broadcaster });
    assertSignTransaction(signer, "prepareConfidentialTransfer");
    // After the assert, TS treats signer.signTransaction as non-optional.
    const signed = await signer.signTransaction("0xunsigned" as Hex);
    expect(signed).toBe("0xsignedtx");
    expect(broadcaster.signTransaction).toHaveBeenCalledWith("0xunsigned");
  });

  test("assertSignTransaction throws on a signer without signTransaction", () => {
    const onlineOnly = {
      walletAccount: {
        getSnapshot: () => ACCOUNT,
        isReady: () => true,
        subscribe: () => () => {},
      },
      requireWalletAccount: () => ACCOUNT,
      signTypedData: async () => "0xsig" as Hex,
      writeContract: async () => "0xtx" as Hex,
    };
    expect(() => assertSignTransaction(onlineOnly as never, "prepare")).toThrow(
      SignerCapabilityError,
    );
  });
});

describe("BroadcastSigner wallet-account semantics", () => {
  test("subscribe replays the initial account synchronously", () => {
    const signer = new BroadcastSigner({ account: ACCOUNT, broadcaster: makeBroadcaster() });
    const listener = vi.fn();
    const unsubscribe = signer.walletAccount.subscribe(listener);
    expect(listener).toHaveBeenCalledWith({ previous: undefined, next: ACCOUNT });
    unsubscribe();
  });

  test("subscribe + unsubscribe is idempotent", () => {
    const signer = new BroadcastSigner({ account: ACCOUNT, broadcaster: makeBroadcaster() });
    const unsubscribe = signer.walletAccount.subscribe(() => {});
    unsubscribe();
    expect(() => unsubscribe()).not.toThrow();
  });

  test("requireWalletAccount on a cleared store throws WalletNotConnectedError", () => {
    // The static-account contract says the account is fixed at construction,
    // but the underlying store is mutable — this guards the BaseSigner
    // WalletNotConnected fallback if a caller clears the snapshot.
    const signer = new BroadcastSigner({ account: ACCOUNT, broadcaster: makeBroadcaster() });
    signer.walletAccount.setSnapshot(undefined);
    expect(() => signer.requireWalletAccount("op")).toThrow(WalletNotConnectedError);
  });
});
