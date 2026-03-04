import { describe, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { useTokenMetadata } from "../token/use-token-metadata";
import { useIsConfidential, useIsWrapper } from "../token/use-is-confidential";
import { useTotalSupply } from "../token/use-total-supply";
import { useConfidentialIsApproved } from "../token/use-confidential-is-approved";
import { useWrapperDiscovery } from "../token/use-wrapper-discovery";
import {
  useShieldFee,
  useUnshieldFee,
  useBatchTransferFee,
  useFeeRecipient,
} from "../token/use-fees";
import { usePublicKey } from "../relayer/use-public-key";
import { usePublicParams } from "../relayer/use-public-params";
import { useUnderlyingAllowance } from "../token/use-underlying-allowance";
import { createWrapper, renderWithProviders, createMockSigner } from "./test-utils";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
const USER = "0x2222222222222222222222222222222222222222" as Address;
const WRAPPER = "0x4444444444444444444444444444444444444444" as Address;
const COORDINATOR = "0x5555555555555555555555555555555555555555" as Address;

describe("query hooks", () => {
  describe("useTokenMetadata", () => {
    test("default", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract)
        .mockResolvedValueOnce("TestToken")
        .mockResolvedValueOnce("TT")
        .mockResolvedValueOnce(18);

      const { result } = renderWithProviders(() => useTokenMetadata(TOKEN), { signer });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const { data, dataUpdatedAt, ...state } = result.current;
      expect(data).toEqual({ name: "TestToken", symbol: "TT", decimals: 18 });
      expect(dataUpdatedAt).toEqual(expect.any(Number));
      expect(state).toMatchInlineSnapshot(`
        {
          "error": null,
          "errorUpdateCount": 0,
          "errorUpdatedAt": 0,
          "failureCount": 0,
          "failureReason": null,
          "fetchStatus": "idle",
          "isEnabled": true,
          "isError": false,
          "isFetched": true,
          "isFetchedAfterMount": true,
          "isFetching": false,
          "isInitialLoading": false,
          "isLoading": false,
          "isLoadingError": false,
          "isPaused": false,
          "isPending": false,
          "isPlaceholderData": false,
          "isRefetchError": false,
          "isRefetching": false,
          "isStale": false,
          "isSuccess": true,
          "promise": Promise {
            "reason": [Error: experimental_prefetchInRender feature flag is not enabled],
            "status": "rejected",
          },
          "refetch": [Function],
          "status": "success",
        }
      `);
    });
  });

  describe("useIsConfidential", () => {
    test("default", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract).mockResolvedValue(true);

      const { result } = renderWithProviders(() => useIsConfidential(TOKEN), { signer });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const { data, dataUpdatedAt, ...state } = result.current;
      expect(data).toBe(true);
      expect(dataUpdatedAt).toEqual(expect.any(Number));
      expect(state).toMatchInlineSnapshot(`
        {
          "error": null,
          "errorUpdateCount": 0,
          "errorUpdatedAt": 0,
          "failureCount": 0,
          "failureReason": null,
          "fetchStatus": "idle",
          "isEnabled": true,
          "isError": false,
          "isFetched": true,
          "isFetchedAfterMount": true,
          "isFetching": false,
          "isInitialLoading": false,
          "isLoading": false,
          "isLoadingError": false,
          "isPaused": false,
          "isPending": false,
          "isPlaceholderData": false,
          "isRefetchError": false,
          "isRefetching": false,
          "isStale": false,
          "isSuccess": true,
          "promise": Promise {
            "reason": [Error: experimental_prefetchInRender feature flag is not enabled],
            "status": "rejected",
          },
          "refetch": [Function],
          "status": "success",
        }
      `);
    });
  });

  describe("useIsWrapper", () => {
    test("default", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract).mockResolvedValue(false);

      const { result } = renderWithProviders(() => useIsWrapper(TOKEN), { signer });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const { data, dataUpdatedAt, ...state } = result.current;
      expect(data).toBe(false);
      expect(dataUpdatedAt).toEqual(expect.any(Number));
      expect(state).toMatchInlineSnapshot(`
        {
          "error": null,
          "errorUpdateCount": 0,
          "errorUpdatedAt": 0,
          "failureCount": 0,
          "failureReason": null,
          "fetchStatus": "idle",
          "isEnabled": true,
          "isError": false,
          "isFetched": true,
          "isFetchedAfterMount": true,
          "isFetching": false,
          "isInitialLoading": false,
          "isLoading": false,
          "isLoadingError": false,
          "isPaused": false,
          "isPending": false,
          "isPlaceholderData": false,
          "isRefetchError": false,
          "isRefetching": false,
          "isStale": false,
          "isSuccess": true,
          "promise": Promise {
            "reason": [Error: experimental_prefetchInRender feature flag is not enabled],
            "status": "rejected",
          },
          "refetch": [Function],
          "status": "success",
        }
      `);
    });
  });

  describe("useTotalSupply", () => {
    test("default", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract).mockResolvedValue(42000n);

      const { result } = renderWithProviders(() => useTotalSupply(TOKEN), { signer });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const { data, dataUpdatedAt, ...state } = result.current;
      expect(data).toBe(42000n);
      expect(dataUpdatedAt).toEqual(expect.any(Number));
      expect(state).toMatchInlineSnapshot(`
        {
          "error": null,
          "errorUpdateCount": 0,
          "errorUpdatedAt": 0,
          "failureCount": 0,
          "failureReason": null,
          "fetchStatus": "idle",
          "isEnabled": true,
          "isError": false,
          "isFetched": true,
          "isFetchedAfterMount": true,
          "isFetching": false,
          "isInitialLoading": false,
          "isLoading": false,
          "isLoadingError": false,
          "isPaused": false,
          "isPending": false,
          "isPlaceholderData": false,
          "isRefetchError": false,
          "isRefetching": false,
          "isStale": false,
          "isSuccess": true,
          "promise": Promise {
            "reason": [Error: experimental_prefetchInRender feature flag is not enabled],
            "status": "rejected",
          },
          "refetch": [Function],
          "status": "success",
        }
      `);
    });
  });

  describe("useConfidentialIsApproved", () => {
    test("behavior: disabled when spender is undefined", () => {
      const { result } = renderWithProviders(() =>
        useConfidentialIsApproved({ tokenAddress: TOKEN, spender: undefined }),
      );

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe("idle");
      expect(result.current.data).toBeUndefined();
    });

    test("default", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract).mockResolvedValue(true);

      const { result } = renderWithProviders(
        () =>
          useConfidentialIsApproved({
            tokenAddress: TOKEN,
            spender: "0x3333333333333333333333333333333333333333" as Address,
          }),
        { signer },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const { data, dataUpdatedAt, ...state } = result.current;
      expect(data).toBe(true);
      expect(dataUpdatedAt).toEqual(expect.any(Number));
      expect(state).toMatchInlineSnapshot(`
        {
          "error": null,
          "errorUpdateCount": 0,
          "errorUpdatedAt": 0,
          "failureCount": 0,
          "failureReason": null,
          "fetchStatus": "idle",
          "isEnabled": true,
          "isError": false,
          "isFetched": true,
          "isFetchedAfterMount": true,
          "isFetching": false,
          "isInitialLoading": false,
          "isLoading": false,
          "isLoadingError": false,
          "isPaused": false,
          "isPending": false,
          "isPlaceholderData": false,
          "isRefetchError": false,
          "isRefetching": false,
          "isStale": false,
          "isSuccess": true,
          "promise": Promise {
            "reason": [Error: experimental_prefetchInRender feature flag is not enabled],
            "status": "rejected",
          },
          "refetch": [Function],
          "status": "success",
        }
      `);
    });
  });

  describe("useWrapperDiscovery", () => {
    test("behavior: disabled when coordinatorAddress is undefined", () => {
      const { result } = renderWithProviders(() =>
        useWrapperDiscovery({ tokenAddress: TOKEN, coordinatorAddress: undefined }),
      );

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe("idle");
      expect(result.current.data).toBeUndefined();
    });

    test("behavior: coordinatorAddress: undefined -> defined", async () => {
      const signer = createMockSigner();
      const wrapperAddress = "0x7777777777777777777777777777777777777777" as Address;
      vi.mocked(signer.readContract).mockResolvedValue(wrapperAddress);

      const ctx = createWrapper({ signer });
      const { result, rerender } = renderHook(
        ({ coordinatorAddress }) => useWrapperDiscovery({ tokenAddress: TOKEN, coordinatorAddress }),
        {
          wrapper: ctx.Wrapper,
          initialProps: { coordinatorAddress: undefined as Address | undefined },
        },
      );

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe("idle");

      rerender({ coordinatorAddress: COORDINATOR });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(wrapperAddress);
    });

    test("default", async () => {
      const signer = createMockSigner();
      const wrapperAddress = "0x4444444444444444444444444444444444444444" as Address;
      vi.mocked(signer.readContract).mockResolvedValue(wrapperAddress);

      const { result } = renderWithProviders(
        () =>
          useWrapperDiscovery({
            tokenAddress: TOKEN,
            coordinatorAddress: COORDINATOR,
          }),
        { signer },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const { data, dataUpdatedAt, ...state } = result.current;
      expect(data).toBe(wrapperAddress);
      expect(dataUpdatedAt).toEqual(expect.any(Number));
      expect(state).toMatchInlineSnapshot(`
        {
          "error": null,
          "errorUpdateCount": 0,
          "errorUpdatedAt": 0,
          "failureCount": 0,
          "failureReason": null,
          "fetchStatus": "idle",
          "isEnabled": true,
          "isError": false,
          "isFetched": true,
          "isFetchedAfterMount": true,
          "isFetching": false,
          "isInitialLoading": false,
          "isLoading": false,
          "isLoadingError": false,
          "isPaused": false,
          "isPending": false,
          "isPlaceholderData": false,
          "isRefetchError": false,
          "isRefetching": false,
          "isStale": false,
          "isSuccess": true,
          "promise": Promise {
            "reason": [Error: experimental_prefetchInRender feature flag is not enabled],
            "status": "rejected",
          },
          "refetch": [Function],
          "status": "success",
        }
      `);
    });
  });

  describe("useUnderlyingAllowance", () => {
    test("default", async () => {
      const signer = createMockSigner();
      vi.mocked(signer.readContract).mockResolvedValue(1000n);

      const { result } = renderWithProviders(
        () => useUnderlyingAllowance({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
        { signer },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const { data, dataUpdatedAt, ...state } = result.current;
      expect(data).toBe(1000n);
      expect(dataUpdatedAt).toEqual(expect.any(Number));
      expect(state).toMatchInlineSnapshot(`
        {
          "error": null,
          "errorUpdateCount": 0,
          "errorUpdatedAt": 0,
          "failureCount": 0,
          "failureReason": null,
          "fetchStatus": "idle",
          "isEnabled": true,
          "isError": false,
          "isFetched": true,
          "isFetchedAfterMount": true,
          "isFetching": false,
          "isInitialLoading": false,
          "isLoading": false,
          "isLoadingError": false,
          "isPaused": false,
          "isPending": false,
          "isPlaceholderData": false,
          "isRefetchError": false,
          "isRefetching": false,
          "isStale": false,
          "isSuccess": true,
          "promise": Promise {
            "reason": [Error: experimental_prefetchInRender feature flag is not enabled],
            "status": "rejected",
          },
          "refetch": [Function],
          "status": "success",
        }
      `);
    });

    test("behavior: signer undefined -> defined", async () => {
      const signer = createMockSigner();
      let resolveAddress: (value: Address) => void;
      const addressPromise = new Promise<Address>((resolve) => {
        resolveAddress = resolve;
      });
      vi.mocked(signer.getAddress).mockReturnValue(addressPromise);
      vi.mocked(signer.readContract).mockResolvedValue(1000n);

      const { result, rerender } = renderWithProviders(
        () => useUnderlyingAllowance({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
        { signer },
      );

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe("idle");

      resolveAddress!(USER);
      rerender();

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBe(1000n);
    });
  });

  describe("fee hooks", () => {
    const feeConfig = {
      feeManagerAddress: "0x6666666666666666666666666666666666666666" as Address,
      amount: 1000n,
      from: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
      to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    };

    describe("useShieldFee", () => {
      test("default", async () => {
        const signer = createMockSigner();
        vi.mocked(signer.readContract).mockResolvedValue(50n);

        const { result } = renderWithProviders(() => useShieldFee(feeConfig), { signer });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        const { data, dataUpdatedAt, ...state } = result.current;
        expect(data).toBe(50n);
        expect(dataUpdatedAt).toEqual(expect.any(Number));
        expect(state).toMatchInlineSnapshot(`
          {
            "error": null,
            "errorUpdateCount": 0,
            "errorUpdatedAt": 0,
            "failureCount": 0,
            "failureReason": null,
            "fetchStatus": "idle",
            "isEnabled": true,
            "isError": false,
            "isFetched": true,
            "isFetchedAfterMount": true,
            "isFetching": false,
            "isInitialLoading": false,
            "isLoading": false,
            "isLoadingError": false,
            "isPaused": false,
            "isPending": false,
            "isPlaceholderData": false,
            "isRefetchError": false,
            "isRefetching": false,
            "isStale": false,
            "isSuccess": true,
            "promise": Promise {
              "reason": [Error: experimental_prefetchInRender feature flag is not enabled],
              "status": "rejected",
            },
            "refetch": [Function],
            "status": "success",
          }
        `);
      });
    });

    describe("useUnshieldFee", () => {
      test("default", async () => {
        const signer = createMockSigner();
        vi.mocked(signer.readContract).mockResolvedValue(25n);

        const { result } = renderWithProviders(() => useUnshieldFee(feeConfig), { signer });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        const { data, dataUpdatedAt, ...state } = result.current;
        expect(data).toBe(25n);
        expect(dataUpdatedAt).toEqual(expect.any(Number));
        expect(state).toMatchInlineSnapshot(`
          {
            "error": null,
            "errorUpdateCount": 0,
            "errorUpdatedAt": 0,
            "failureCount": 0,
            "failureReason": null,
            "fetchStatus": "idle",
            "isEnabled": true,
            "isError": false,
            "isFetched": true,
            "isFetchedAfterMount": true,
            "isFetching": false,
            "isInitialLoading": false,
            "isLoading": false,
            "isLoadingError": false,
            "isPaused": false,
            "isPending": false,
            "isPlaceholderData": false,
            "isRefetchError": false,
            "isRefetching": false,
            "isStale": false,
            "isSuccess": true,
            "promise": Promise {
              "reason": [Error: experimental_prefetchInRender feature flag is not enabled],
              "status": "rejected",
            },
            "refetch": [Function],
            "status": "success",
          }
        `);
      });
    });

    describe("useBatchTransferFee", () => {
      test("default", async () => {
        const signer = createMockSigner();
        vi.mocked(signer.readContract).mockResolvedValue(10n);

        const { result } = renderWithProviders(
          () => useBatchTransferFee("0x6666666666666666666666666666666666666666" as Address),
          {
            signer,
          },
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        const { data, dataUpdatedAt, ...state } = result.current;
        expect(data).toBe(10n);
        expect(dataUpdatedAt).toEqual(expect.any(Number));
        expect(state).toMatchInlineSnapshot(`
          {
            "error": null,
            "errorUpdateCount": 0,
            "errorUpdatedAt": 0,
            "failureCount": 0,
            "failureReason": null,
            "fetchStatus": "idle",
            "isEnabled": true,
            "isError": false,
            "isFetched": true,
            "isFetchedAfterMount": true,
            "isFetching": false,
            "isInitialLoading": false,
            "isLoading": false,
            "isLoadingError": false,
            "isPaused": false,
            "isPending": false,
            "isPlaceholderData": false,
            "isRefetchError": false,
            "isRefetching": false,
            "isStale": false,
            "isSuccess": true,
            "promise": Promise {
              "reason": [Error: experimental_prefetchInRender feature flag is not enabled],
              "status": "rejected",
            },
            "refetch": [Function],
            "status": "success",
          }
        `);
      });
    });

    describe("useFeeRecipient", () => {
      test("default", async () => {
        const signer = createMockSigner();
        vi.mocked(signer.readContract).mockResolvedValue("0xrecipient");

        const { result } = renderWithProviders(
          () => useFeeRecipient("0x6666666666666666666666666666666666666666" as Address),
          {
            signer,
          },
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        const { data, dataUpdatedAt, ...state } = result.current;
        expect(data).toBe("0xrecipient");
        expect(dataUpdatedAt).toEqual(expect.any(Number));
        expect(state).toMatchInlineSnapshot(`
          {
            "error": null,
            "errorUpdateCount": 0,
            "errorUpdatedAt": 0,
            "failureCount": 0,
            "failureReason": null,
            "fetchStatus": "idle",
            "isEnabled": true,
            "isError": false,
            "isFetched": true,
            "isFetchedAfterMount": true,
            "isFetching": false,
            "isInitialLoading": false,
            "isLoading": false,
            "isLoadingError": false,
            "isPaused": false,
            "isPending": false,
            "isPlaceholderData": false,
            "isRefetchError": false,
            "isRefetching": false,
            "isStale": false,
            "isSuccess": true,
            "promise": Promise {
              "reason": [Error: experimental_prefetchInRender feature flag is not enabled],
              "status": "rejected",
            },
            "refetch": [Function],
            "status": "success",
          }
        `);
      });
    });
  });

  describe("usePublicKey", () => {
    test("default", async () => {
      const { result } = renderWithProviders(() => usePublicKey());

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const { data, dataUpdatedAt, ...state } = result.current;
      expect(data).toEqual({
        publicKeyId: "pk-1",
        publicKey: new Uint8Array([1]),
      });
      expect(dataUpdatedAt).toEqual(expect.any(Number));
      expect(state).toMatchInlineSnapshot(`
        {
          "error": null,
          "errorUpdateCount": 0,
          "errorUpdatedAt": 0,
          "failureCount": 0,
          "failureReason": null,
          "fetchStatus": "idle",
          "isEnabled": true,
          "isError": false,
          "isFetched": true,
          "isFetchedAfterMount": true,
          "isFetching": false,
          "isInitialLoading": false,
          "isLoading": false,
          "isLoadingError": false,
          "isPaused": false,
          "isPending": false,
          "isPlaceholderData": false,
          "isRefetchError": false,
          "isRefetching": false,
          "isStale": false,
          "isSuccess": true,
          "promise": Promise {
            "reason": [Error: experimental_prefetchInRender feature flag is not enabled],
            "status": "rejected",
          },
          "refetch": [Function],
          "status": "success",
        }
      `);
    });
  });

  describe("usePublicParams", () => {
    test("default", async () => {
      const { result } = renderWithProviders(() => usePublicParams(2048));

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const { data, dataUpdatedAt, ...state } = result.current;
      expect(data).toEqual({
        publicParams: new Uint8Array([2]),
        publicParamsId: "pp-1",
      });
      expect(dataUpdatedAt).toEqual(expect.any(Number));
      expect(state).toMatchInlineSnapshot(`
        {
          "error": null,
          "errorUpdateCount": 0,
          "errorUpdatedAt": 0,
          "failureCount": 0,
          "failureReason": null,
          "fetchStatus": "idle",
          "isEnabled": true,
          "isError": false,
          "isFetched": true,
          "isFetchedAfterMount": true,
          "isFetching": false,
          "isInitialLoading": false,
          "isLoading": false,
          "isLoadingError": false,
          "isPaused": false,
          "isPending": false,
          "isPlaceholderData": false,
          "isRefetchError": false,
          "isRefetching": false,
          "isStale": false,
          "isSuccess": true,
          "promise": Promise {
            "reason": [Error: experimental_prefetchInRender feature flag is not enabled],
            "status": "rejected",
          },
          "refetch": [Function],
          "status": "success",
        }
      `);
    });
  });
});
