import { describe, it, expect, vi, TEST_ADDR_B } from "../test-fixtures";
import { ReadonlyToken } from "../token/readonly-token";
import { Token } from "../token/token";
import {
  DecryptionFailedError,
  SignerNotConfiguredError,
  WalletAccountNotReadyError,
  ZamaError,
  ZamaErrorCode,
} from "../errors";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { GenericSigner, WalletAccountChange, WalletAccountListener } from "../types";
import type { Address } from "viem";
import type { DecryptHandle } from "../query/user-decrypt";

const NEXT_USER_ADDRESS = TEST_ADDR_B;

describe("ZamaSDK", () => {
  it("exposes signer and storage", ({ sdk, signer, storage }) => {
    expect(sdk.signer).toBe(signer);
    expect(sdk.storage).toBe(storage);
  });

  it("createReadonlyToken returns ReadonlyToken", ({ sdk, tokenAddress }) => {
    const token = sdk.createReadonlyToken(tokenAddress);
    expect(token).toBeInstanceOf(ReadonlyToken);
    expect(token.address).toBe(tokenAddress);
    expect(token.sdk).toBe(sdk);
  });

  it("createToken returns Token", ({ sdk, tokenAddress }) => {
    const token = sdk.createToken(tokenAddress);
    expect(token).toBeInstanceOf(Token);
    expect(token.address).toBe(tokenAddress);
  });

  for (const method of ["createToken", "createReadonlyToken"] as const) {
    it(`${method} exposes the SDK instance`, ({ sdk, tokenAddress }) => {
      const token = sdk[method](tokenAddress);
      expect(token.sdk).toBe(sdk);
    });
  }

  it("creates distinct instances per address", ({ sdk }) => {
    const t1 = sdk.createReadonlyToken("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address);
    const t2 = sdk.createReadonlyToken("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address);
    expect(t1).not.toBe(t2);
    expect(t1.address).toBe("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa");
    expect(t2.address).toBe("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB");
  });

  it("terminate delegates to relayer.terminate", ({ sdk, relayer }) => {
    sdk.terminate();
    expect(relayer.terminate).toHaveBeenCalledOnce();
  });

  it("[Symbol.dispose] delegates to terminate", ({ sdk, relayer }) => {
    sdk[Symbol.dispose]();
    expect(relayer.terminate).toHaveBeenCalledOnce();
  });

  it("subscribes to signer wallet account changes", ({ createMockSigner, createSDK }) => {
    const unsubscribe = vi.fn();
    const walletAccount = createMockSigner().walletAccount.getSnapshot();
    const subscribe = vi.fn((listener: WalletAccountListener) => {
      if (walletAccount) {
        listener({ previous: undefined, next: walletAccount });
      }
      return unsubscribe;
    });
    const subscribeSigner = {
      ...createMockSigner(),
      walletAccount: {
        getSnapshot: vi.fn().mockReturnValue(walletAccount),
        subscribe,
        isReady: vi.fn().mockReturnValue(true),
      },
    };

    const sdk = createSDK({ signer: subscribeSigner });

    expect(subscribe).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledWith(expect.any(Function));

    sdk.terminate();
  });

  it("terminate calls unsubscribe from signer wallet account subscription", ({
    createMockSigner,
    createSDK,
  }) => {
    const unsubscribe = vi.fn();
    const subscribeSigner = {
      ...createMockSigner(),
      walletAccount: {
        getSnapshot: vi.fn().mockReturnValue(createMockSigner().walletAccount.getSnapshot()),
        subscribe: vi.fn().mockReturnValue(unsubscribe),
        isReady: vi.fn().mockReturnValue(true),
      },
    };

    const sdk = createSDK({ signer: subscribeSigner });

    sdk.terminate();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("terminate calls signer.dispose", ({ createMockSigner, createSDK }) => {
    const dispose = vi.fn();
    const sdk = createSDK({ signer: { ...createMockSigner(), dispose } });

    sdk.terminate();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it("refreshes a not-ready signer once before checking chain alignment", async ({
    createMockSigner,
    createSDK,
    provider,
  }) => {
    const walletAccount = createMockSigner().walletAccount.getSnapshot()!;
    const requireWalletAccount = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new WalletAccountNotReadyError("testOp");
      })
      .mockReturnValue(walletAccount);
    const refreshWalletAccount = vi.fn().mockResolvedValue(walletAccount);
    const sdk = createSDK({
      signer: {
        ...createMockSigner(),
        requireWalletAccount,
        refreshWalletAccount,
      },
    });
    vi.mocked(provider.getChainId).mockResolvedValue(walletAccount.chainId);

    await expect(sdk.requireChainAlignment("testOp")).resolves.toBe(walletAccount.chainId);
    expect(refreshWalletAccount).toHaveBeenCalledOnce();
    expect(requireWalletAccount).toHaveBeenCalledTimes(2);
  });

  it("does not fail when subscribe returns a no-op unsubscribe", ({ sdk }) => {
    sdk.terminate();
  });

  describe("lifecycle wallet account change", () => {
    function createSubscribeSigner(mockSigner: GenericSigner) {
      let capturedOnWalletAccountChange: WalletAccountListener;
      const signer = {
        ...mockSigner,
        walletAccount: {
          getSnapshot: vi.fn().mockReturnValue(mockSigner.walletAccount.getSnapshot()),
          subscribe: vi.fn((onWalletAccountChange: WalletAccountListener) => {
            capturedOnWalletAccountChange = onWalletAccountChange;
            return () => {};
          }),
          isReady: vi.fn().mockReturnValue(true),
        },
      };
      const emitChange = (change: WalletAccountChange) => capturedOnWalletAccountChange(change);
      return { signer, emitChange };
    }

    it("clears decrypt cache for previous requester", async ({
      createMockSigner,
      createSDK,
      handle,
      tokenAddress,
      userAddress,
      cache,
    }) => {
      const { signer, emitChange } = createSubscribeSigner(createMockSigner());

      const sdk = createSDK({ signer });

      await cache.set(userAddress, tokenAddress, handle, 123n);
      await cache.set(NEXT_USER_ADDRESS, tokenAddress, handle, 456n);

      emitChange({
        previous: { address: userAddress, chainId: 31337 },
        next: { address: NEXT_USER_ADDRESS, chainId: 31337 },
      });

      await vi.waitFor(async () => {
        expect(await cache.get(userAddress, tokenAddress, handle)).toBeNull();
      });
      expect(await cache.get(NEXT_USER_ADDRESS, tokenAddress, handle)).toBe(456n);

      sdk.terminate();
    });

    it("notifies listeners even when relayer chain switching fails", async ({
      createMockSigner,
      createMockRelayer,
      createSDK,
    }) => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { signer, emitChange } = createSubscribeSigner(createMockSigner());
      const relayer = createMockRelayer({
        switchChain: vi.fn(() => {
          throw new Error("unknown chain");
        }),
      });
      const sdk = createSDK({ relayer, signer });
      const listener = vi.fn();
      sdk.onWalletAccountChange(listener);

      emitChange({
        previous: undefined,
        next: { address: NEXT_USER_ADDRESS, chainId: 1 },
      });

      await vi.waitFor(() => {
        expect(listener).toHaveBeenCalledWith({
          previous: undefined,
          next: { address: NEXT_USER_ADDRESS, chainId: 1 },
        });
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("switch relayer chain"),
        expect.any(Error),
      );

      warnSpy.mockRestore();
      sdk.terminate();
    });

    it("fans out wallet account listeners without waiting for slow listeners", async ({
      createMockSigner,
      createSDK,
    }) => {
      const { signer, emitChange } = createSubscribeSigner(createMockSigner());
      const sdk = createSDK({ signer });
      let releaseSlowListener: () => void = () => {};
      const slowListener = vi.fn(() => {
        return new Promise<void>((resolve) => {
          releaseSlowListener = resolve;
        });
      });
      const fastListener = vi.fn();
      sdk.onWalletAccountChange((change) => {
        void slowListener(change);
      });
      sdk.onWalletAccountChange(fastListener);

      emitChange({
        previous: undefined,
        next: undefined,
      });

      await vi.waitFor(() => {
        expect(fastListener).toHaveBeenCalledOnce();
      });
      expect(slowListener).toHaveBeenCalledOnce();
      releaseSlowListener();

      sdk.terminate();
    });
  });

  describe("publicDecrypt", () => {
    it("delegates to relayer.publicDecrypt and returns the result", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const result = await sdk.publicDecrypt([handle]);
      expect(relayer.publicDecrypt).toHaveBeenCalledWith([handle]);
      expect(result).toEqual({
        clearValues: { [handle]: 500n },
        abiEncodedClearValues: "0x1f4",
        decryptionProof: "0xproof",
      });
    });

    it("returns empty result for empty handles without calling relayer", async ({
      sdk,
      relayer,
    }) => {
      const result = await sdk.publicDecrypt([]);
      expect(result).toEqual({
        clearValues: {},
        decryptionProof: "0x",
        abiEncodedClearValues: "0x",
      });
      expect(relayer.publicDecrypt).not.toHaveBeenCalled();
    });

    it("wraps error on failure", async ({ sdk, relayer, handle }) => {
      vi.mocked(relayer.publicDecrypt).mockRejectedValueOnce(new Error("relayer down"));

      await expect(sdk.publicDecrypt([handle])).rejects.toThrow(DecryptionFailedError);
    });

    it("re-throws DecryptionFailedError as-is", async ({ sdk, relayer, handle }) => {
      const original = new DecryptionFailedError("already typed");
      vi.mocked(relayer.publicDecrypt).mockRejectedValueOnce(original);

      await expect(sdk.publicDecrypt([handle])).rejects.toBe(original);
    });
  });

  describe("allow", () => {
    const CONTRACT_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
    const CONTRACT_B = "0x3C3c3C3c3C3C3c3c3c3C3c3C3C3c3c3C3c3c3C3C" as Address;

    it("triggers a wallet signature when no permit is cached", async ({ sdk, signer }) => {
      await sdk.allow([CONTRACT_A, CONTRACT_B]);
      expect(signer.signTypedData).toHaveBeenCalled();
    });

    it("returns immediately for empty array without calling the signer", async ({
      sdk,
      signer,
    }) => {
      await sdk.allow([]);
      expect(signer.signTypedData).not.toHaveBeenCalled();
    });
  });

  describe("revokePermits clears decrypt cache", () => {
    const CONTRACT_A = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;

    it("revokePermits() clears cache — decrypt after revokePermits hits relayer again", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const handles: DecryptHandle[] = [{ handle, contractAddress: CONTRACT_A }];

      await sdk.userDecrypt(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();

      await sdk.revokePermits();

      // Cache was cleared — relayer is called again
      await sdk.userDecrypt(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    });

    it("revokePermits(addresses) clears cache for the requester", async ({
      sdk,
      relayer,
      handle,
    }) => {
      const handles: DecryptHandle[] = [{ handle, contractAddress: CONTRACT_A }];

      await sdk.userDecrypt(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledOnce();

      await sdk.revokePermits([CONTRACT_A]);

      await sdk.userDecrypt(handles);
      expect(relayer.userDecrypt).toHaveBeenCalledTimes(2);
    });
  });

  describe("encrypt", () => {
    const ENCRYPT_PARAMS = {
      values: [{ value: 100n, type: "euint64" as const }],
      contractAddress: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address,
      userAddress: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address,
    };

    it("delegates to relayer.encrypt and returns result", async ({ sdk, relayer }) => {
      const result = await sdk.encrypt(ENCRYPT_PARAMS);

      expect(relayer.encrypt).toHaveBeenCalledWith(ENCRYPT_PARAMS);
      expect(result.handles).toHaveLength(1);
      expect(result.inputProof).toBeInstanceOf(Uint8Array);
    });

    it("emits EncryptStart and EncryptEnd events with tokenAddress", async ({ createSDK }) => {
      const events: { type: string; tokenAddress?: Address }[] = [];
      const sdk = createSDK({ onEvent: (e) => events.push(e) });

      await sdk.encrypt(ENCRYPT_PARAMS);

      expect(events).toContainEqual(
        expect.objectContaining({
          type: ZamaSDKEvents.EncryptStart,
          tokenAddress: ENCRYPT_PARAMS.contractAddress,
        }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({
          type: ZamaSDKEvents.EncryptEnd,
          tokenAddress: ENCRYPT_PARAMS.contractAddress,
          durationMs: expect.any(Number),
        }),
      );
    });

    it("wraps non-ZamaError in EncryptionFailed", async ({ sdk, relayer }) => {
      vi.mocked(relayer.encrypt).mockRejectedValueOnce(new Error("boom"));

      await expect(sdk.encrypt(ENCRYPT_PARAMS)).rejects.toSatisfy((err: ZamaError) => {
        return (
          err instanceof ZamaError &&
          err.code === ZamaErrorCode.EncryptionFailed &&
          err.message === "Encryption failed"
        );
      });
    });

    it("re-throws ZamaError as-is", async ({ sdk, relayer }) => {
      const original = new ZamaError(ZamaErrorCode.EncryptionFailed, "already wrapped");
      vi.mocked(relayer.encrypt).mockRejectedValueOnce(original);

      await expect(sdk.encrypt(ENCRYPT_PARAMS)).rejects.toBe(original);
    });

    it("emits EncryptError with tokenAddress on failure", async ({ createSDK, relayer }) => {
      const events: { type: string; tokenAddress?: Address }[] = [];
      const sdk = createSDK({ onEvent: (e) => events.push(e) });
      vi.mocked(relayer.encrypt).mockRejectedValueOnce(new Error("boom"));

      await expect(sdk.encrypt(ENCRYPT_PARAMS)).rejects.toThrow();

      expect(events).toContainEqual(
        expect.objectContaining({
          type: ZamaSDKEvents.EncryptError,
          tokenAddress: ENCRYPT_PARAMS.contractAddress,
          durationMs: expect.any(Number),
        }),
      );
    });
  });

  describe("delegation signer guards", () => {
    it("throws SignerNotConfiguredError when no signer is configured", async ({
      createSDK,
      tokenAddress,
      delegateAddress,
    }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(
        sdk.delegateDecryption({ contractAddress: tokenAddress, delegateAddress }),
      ).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });

    it("throws SignerNotConfiguredError when no signer is configured", async ({
      createSDK,
      tokenAddress,
      delegateAddress,
    }) => {
      const sdk = createSDK({ signer: undefined });
      await expect(
        sdk.revokeDelegation({ contractAddress: tokenAddress, delegateAddress }),
      ).rejects.toBeInstanceOf(SignerNotConfiguredError);
    });
  });
});
