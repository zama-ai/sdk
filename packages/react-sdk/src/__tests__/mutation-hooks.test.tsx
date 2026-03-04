import { act, waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "vitest";
import { useEncrypt } from "../relayer/use-encrypt";
import { useApproveUnderlying } from "../token/use-approve-underlying";
import { useAuthorizeAll } from "../token/use-authorize-all";
import { useConfidentialApprove } from "../token/use-confidential-approve";
import { useConfidentialTransfer } from "../token/use-confidential-transfer";
import { useFinalizeUnwrap } from "../token/use-finalize-unwrap";
import { useShield } from "../token/use-shield";
import { useUnshield } from "../token/use-unshield";
import { useUnshieldAll } from "../token/use-unshield-all";
import { useUnwrap } from "../token/use-unwrap";
import { useUnwrapAll } from "../token/use-unwrap-all";
import { createMockRelayer, createMockSigner, renderWithProviders } from "./test-utils";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
const USER = "0x2222222222222222222222222222222222222222" as Address;
const WRAPPER = "0x4444444444444444444444444444444444444444" as Address;
const RECIPIENT = "0x8888888888888888888888888888888888888888" as Address;

const HANDLE = `0x${"11".repeat(32)}` as Address;
const BURN_AMOUNT_HANDLE = `0x${"22".repeat(32)}` as Address;
const DECRYPTION_PROOF = `0x${"33".repeat(32)}` as Address;
const UNDERLYING = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const UNWRAP_REQUESTED_TOPIC =
  "0x77d02d353c5629272875d11f1b34ec4c65d7430b075575b78cd2502034c469ee";

function toTopicAddress(address: Address): Address {
  return `0x${address.slice(2).padStart(64, "0")}` as Address;
}

function createUnwrapRequestedLog(handle: Address) {
  return {
    topics: [UNWRAP_REQUESTED_TOPIC, toTopicAddress(USER)],
    data: handle,
  };
}

function mockPublicDecrypt(relayer: ReturnType<typeof createMockRelayer>) {
  vi.mocked(relayer.publicDecrypt).mockResolvedValue({
    clearValues: {},
    abiEncodedClearValues: "1",
    decryptionProof: DECRYPTION_PROOF,
  });
}

describe("useConfidentialTransfer", () => {
  test("default", () => {
    const { result } = renderWithProviders(() => useConfidentialTransfer({ tokenAddress: TOKEN }));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toMatchInlineSnapshot(`
      {
        "context": undefined,
        "data": undefined,
        "error": null,
        "failureCount": 0,
        "failureReason": null,
        "isError": false,
        "isIdle": true,
        "isPaused": false,
        "isPending": false,
        "isSuccess": false,
        "status": "idle",
        "submittedAt": 0,
        "variables": undefined,
      }
    `);
  });

  test("cache: invalidates handle and resets balance after transfer", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(() => useConfidentialTransfer({ tokenAddress: TOKEN }), {
      signer,
    });

    const handleKey = zamaQueryKeys.confidentialHandle.token(TOKEN);
    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);

    queryClient.setQueryData(handleKey, HANDLE);
    queryClient.setQueryData(balanceKey, 1000n);

    await act(() => result.current.mutateAsync({ to: RECIPIENT, amount: 500n }));

    expect(queryClient.getQueryState(handleKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(balanceKey)).toBeUndefined();
  });
});

describe("useConfidentialApprove", () => {
  test("default", () => {
    const { result } = renderWithProviders(() => useConfidentialApprove({ tokenAddress: TOKEN }));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toMatchInlineSnapshot(`
      {
        "context": undefined,
        "data": undefined,
        "error": null,
        "failureCount": 0,
        "failureReason": null,
        "isError": false,
        "isIdle": true,
        "isPaused": false,
        "isPending": false,
        "isSuccess": false,
        "status": "idle",
        "submittedAt": 0,
        "variables": undefined,
      }
    `);
  });
});

describe("useApproveUnderlying", () => {
  test("default", () => {
    const { result } = renderWithProviders(() =>
      useApproveUnderlying({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
    );
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toMatchInlineSnapshot(`
      {
        "context": undefined,
        "data": undefined,
        "error": null,
        "failureCount": 0,
        "failureReason": null,
        "isError": false,
        "isIdle": true,
        "isPaused": false,
        "isPending": false,
        "isSuccess": false,
        "status": "idle",
        "submittedAt": 0,
        "variables": undefined,
      }
    `);
  });

  test("cache: invalidates allowance after approve", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);

    const onSuccess = vi.fn();
    const { result, queryClient } = renderWithProviders(
      () =>
        useApproveUnderlying(
          { tokenAddress: TOKEN, wrapperAddress: WRAPPER },
          {
            onSuccess,
          },
        ),
      { signer },
    );

    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(TOKEN);
    queryClient.setQueryData(allowanceKey, 500n);

    await act(() => result.current.mutateAsync({ amount: 1000n }));

    expect(queryClient.getQueryState(allowanceKey)?.isInvalidated).toBe(true);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});

describe("useShield", () => {
  test("default", () => {
    const { result } = renderWithProviders(() =>
      useShield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
    );
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toMatchInlineSnapshot(`
      {
        "context": undefined,
        "data": undefined,
        "error": null,
        "failureCount": 0,
        "failureReason": null,
        "isError": false,
        "isIdle": true,
        "isPaused": false,
        "isPending": false,
        "isSuccess": false,
        "status": "idle",
        "submittedAt": 0,
        "variables": undefined,
      }
    `);
  });

  test("cache: invalidates allowance and resets balance after shield", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);

    const { result, queryClient } = renderWithProviders(
      () => useShield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
      { signer },
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(TOKEN);

    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);

    await act(() => result.current.mutateAsync({ amount: 500n }));

    expect(queryClient.getQueryData(balanceKey)).toBeUndefined();
    expect(queryClient.getQueryState(allowanceKey)?.isInvalidated).toBe(true);
  });
});

describe("useUnshield", () => {
  test("default", () => {
    const { result } = renderWithProviders(() => useUnshield({ tokenAddress: TOKEN }));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toMatchInlineSnapshot(`
      {
        "context": undefined,
        "data": undefined,
        "error": null,
        "failureCount": 0,
        "failureReason": null,
        "isError": false,
        "isIdle": true,
        "isPaused": false,
        "isPending": false,
        "isSuccess": false,
        "status": "idle",
        "submittedAt": 0,
        "variables": undefined,
      }
    `);
  });

  test("cache: invalidates allowance and resets balance after unshield", async () => {
    const signer = createMockSigner();
    const relayer = createMockRelayer();
    vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
      logs: [createUnwrapRequestedLog(BURN_AMOUNT_HANDLE)],
    });
    mockPublicDecrypt(relayer);

    const { result, queryClient } = renderWithProviders(() => useUnshield({ tokenAddress: TOKEN }), {
      signer,
      relayer,
    });

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(TOKEN);

    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);

    await act(() => result.current.mutateAsync({ amount: 300n }));

    expect(queryClient.getQueryData(balanceKey)).toBeUndefined();
    expect(queryClient.getQueryState(allowanceKey)?.isInvalidated).toBe(true);
  });
});

describe("useUnshieldAll", () => {
  test("default", () => {
    const { result } = renderWithProviders(() => useUnshieldAll({ tokenAddress: TOKEN }));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toMatchInlineSnapshot(`
      {
        "context": undefined,
        "data": undefined,
        "error": null,
        "failureCount": 0,
        "failureReason": null,
        "isError": false,
        "isIdle": true,
        "isPaused": false,
        "isPending": false,
        "isSuccess": false,
        "status": "idle",
        "submittedAt": 0,
        "variables": undefined,
      }
    `);
  });

  test("cache: invalidates allowance and resets balance after unshield all", async () => {
    const signer = createMockSigner();
    const relayer = createMockRelayer();
    vi.mocked(signer.readContract).mockResolvedValue(HANDLE);
    vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({
      logs: [createUnwrapRequestedLog(BURN_AMOUNT_HANDLE)],
    });
    mockPublicDecrypt(relayer);

    const { result, queryClient } = renderWithProviders(() => useUnshieldAll({ tokenAddress: TOKEN }), {
      signer,
      relayer,
    });

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(TOKEN);

    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);

    await act(() => result.current.mutateAsync());

    expect(queryClient.getQueryData(balanceKey)).toBeUndefined();
    expect(queryClient.getQueryState(allowanceKey)?.isInvalidated).toBe(true);
  });
});

describe("useUnwrap", () => {
  test("default", () => {
    const { result } = renderWithProviders(() => useUnwrap({ tokenAddress: TOKEN }));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toMatchInlineSnapshot(`
      {
        "context": undefined,
        "data": undefined,
        "error": null,
        "failureCount": 0,
        "failureReason": null,
        "isError": false,
        "isIdle": true,
        "isPaused": false,
        "isPending": false,
        "isSuccess": false,
        "status": "idle",
        "submittedAt": 0,
        "variables": undefined,
      }
    `);
  });

  test("cache: invalidates handle and resets balance after unwrap", async () => {
    const signer = createMockSigner();

    const { result, queryClient } = renderWithProviders(() => useUnwrap({ tokenAddress: TOKEN }), {
      signer,
    });

    const handleKey = zamaQueryKeys.confidentialHandle.token(TOKEN);
    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);

    queryClient.setQueryData(handleKey, HANDLE);
    queryClient.setQueryData(balanceKey, 1000n);

    await act(() => result.current.mutateAsync({ amount: 300n }));

    expect(queryClient.getQueryState(handleKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(balanceKey)).toBeUndefined();
  });
});

describe("useUnwrapAll", () => {
  test("default", () => {
    const { result } = renderWithProviders(() => useUnwrapAll({ tokenAddress: TOKEN }));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toMatchInlineSnapshot(`
      {
        "context": undefined,
        "data": undefined,
        "error": null,
        "failureCount": 0,
        "failureReason": null,
        "isError": false,
        "isIdle": true,
        "isPaused": false,
        "isPending": false,
        "isSuccess": false,
        "status": "idle",
        "submittedAt": 0,
        "variables": undefined,
      }
    `);
  });

  test("cache: invalidates handle and resets balance after unwrap all", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValue(HANDLE);

    const { result, queryClient } = renderWithProviders(() => useUnwrapAll({ tokenAddress: TOKEN }), {
      signer,
    });

    const handleKey = zamaQueryKeys.confidentialHandle.token(TOKEN);
    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);

    queryClient.setQueryData(handleKey, HANDLE);
    queryClient.setQueryData(balanceKey, 1000n);

    await act(() => result.current.mutateAsync());

    expect(queryClient.getQueryState(handleKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(balanceKey)).toBeUndefined();
  });
});

describe("useFinalizeUnwrap", () => {
  test("default", () => {
    const { result } = renderWithProviders(() => useFinalizeUnwrap({ tokenAddress: TOKEN }));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toMatchInlineSnapshot(`
      {
        "context": undefined,
        "data": undefined,
        "error": null,
        "failureCount": 0,
        "failureReason": null,
        "isError": false,
        "isIdle": true,
        "isPaused": false,
        "isPending": false,
        "isSuccess": false,
        "status": "idle",
        "submittedAt": 0,
        "variables": undefined,
      }
    `);
  });

  test("cache: invalidates allowance and resets balance after finalize", async () => {
    const signer = createMockSigner();
    const relayer = createMockRelayer();
    mockPublicDecrypt(relayer);

    const { result, queryClient } = renderWithProviders(
      () => useFinalizeUnwrap({ tokenAddress: TOKEN }),
      { signer, relayer },
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(TOKEN);

    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);

    await act(() => result.current.mutateAsync({ burnAmountHandle: BURN_AMOUNT_HANDLE }));

    expect(queryClient.getQueryData(balanceKey)).toBeUndefined();
    expect(queryClient.getQueryState(allowanceKey)?.isInvalidated).toBe(true);
  });
});

describe("useAuthorizeAll", () => {
  test("default", () => {
    const { result } = renderWithProviders(() => useAuthorizeAll());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toMatchInlineSnapshot(`
      {
        "context": undefined,
        "data": undefined,
        "error": null,
        "failureCount": 0,
        "failureReason": null,
        "isError": false,
        "isIdle": true,
        "isPaused": false,
        "isPending": false,
        "isSuccess": false,
        "status": "idle",
        "submittedAt": 0,
        "variables": undefined,
      }
    `);
  });
});

describe("useEncrypt", () => {
  test("default", () => {
    const { result } = renderWithProviders(() => useEncrypt());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toMatchInlineSnapshot(`
      {
        "context": undefined,
        "data": undefined,
        "error": null,
        "failureCount": 0,
        "failureReason": null,
        "isError": false,
        "isIdle": true,
        "isPaused": false,
        "isPending": false,
        "isSuccess": false,
        "status": "idle",
        "submittedAt": 0,
        "variables": undefined,
      }
    `);
  });

  test("behavior: encrypts on mutate", async () => {
    const relayer = createMockRelayer();
    const { result } = renderWithProviders(() => useEncrypt(), { relayer });

    await act(async () => {
      result.current.mutate({
        values: [1000n],
        contractAddress: TOKEN,
        userAddress: USER,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(relayer.encrypt).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({
      handles: [new Uint8Array([1, 2, 3])],
      inputProof: new Uint8Array([4, 5, 6]),
    });
  });
});

describe("useConfidentialTransfer optimistic updates", () => {
  test("behavior: optimistic subtract on mutate", async () => {
    const signer = createMockSigner();
    let resolveTransfer: (value: string) => void;
    vi.mocked(signer.writeContract).mockReturnValue(
      new Promise((resolve) => {
        resolveTransfer = resolve as (value: string) => void;
      }),
    );

    const { result, queryClient } = renderWithProviders(
      () => useConfidentialTransfer({ tokenAddress: TOKEN, optimistic: true }),
      { signer },
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, "0xuser", "0xhandle");
    queryClient.setQueryData(balanceKey, 5000n);

    await act(async () => {
      result.current.mutate({
        to: RECIPIENT,
        amount: 1200n,
      });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(balanceKey)).toBe(3800n);
    });

    await act(async () => {
      resolveTransfer!("0xtxhash");
    });
  });

  test("behavior: no optimistic update without flag", async () => {
    const signer = createMockSigner();
    let resolveTransfer: (value: string) => void;
    vi.mocked(signer.writeContract).mockReturnValue(
      new Promise((resolve) => {
        resolveTransfer = resolve as (value: string) => void;
      }),
    );

    const { result, queryClient } = renderWithProviders(
      () => useConfidentialTransfer({ tokenAddress: TOKEN }),
      { signer },
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, "0xuser", "0xhandle");
    queryClient.setQueryData(balanceKey, 5000n);

    await act(async () => {
      result.current.mutate({
        to: RECIPIENT,
        amount: 1200n,
      });
    });

    expect(queryClient.getQueryData(balanceKey)).toBe(5000n);

    await act(async () => {
      resolveTransfer!("0xtxhash");
    });
  });

  test("behavior: rolls back optimistic on error", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("tx reverted"));

    const { result, queryClient } = renderWithProviders(
      () => useConfidentialTransfer({ tokenAddress: TOKEN, optimistic: true }),
      { signer },
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, "0xuser", "0xhandle");
    queryClient.setQueryData(balanceKey, 5000n);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");

    await act(async () => {
      result.current.mutate({
        to: RECIPIENT,
        amount: 1200n,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(queryClient.getQueryData(balanceKey)).toBe(5000n);
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(setQueryDataSpy).toHaveBeenCalledWith(balanceKey, 3800n);
    expect(setQueryDataSpy).toHaveBeenCalledWith(balanceKey, 5000n);
  });
});

describe("useShield optimistic updates", () => {
  test("behavior: optimistic add on mutate", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(5000n);

    let resolveWrap: (value: string) => void;
    vi.mocked(signer.writeContract).mockReturnValue(
      new Promise((resolve) => {
        resolveWrap = resolve as (value: string) => void;
      }),
    );

    const { result, queryClient } = renderWithProviders(
      () => useShield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER, optimistic: true }),
      { signer },
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, "0xuser", "0xhandle");
    queryClient.setQueryData(balanceKey, 3000n);
    const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");

    await act(async () => {
      result.current.mutate({ amount: 500n });
    });

    await waitFor(() => {
      expect(setQueryDataSpy).toHaveBeenCalledWith(balanceKey, 3500n);
    });

    await act(async () => {
      resolveWrap!("0xtxhash");
    });
  });

  test("behavior: rolls back optimistic on error", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(5000n);
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("shield failed"));

    const { result, queryClient } = renderWithProviders(
      () => useShield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER, optimistic: true }),
      { signer },
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, "0xuser", "0xhandle");
    queryClient.setQueryData(balanceKey, 3000n);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");

    await act(async () => {
      result.current.mutate({ amount: 500n });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(queryClient.getQueryData(balanceKey)).toBe(3000n);
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(setQueryDataSpy).toHaveBeenCalledWith(balanceKey, 3500n);
    expect(setQueryDataSpy).toHaveBeenCalledWith(balanceKey, 3000n);
  });
});
