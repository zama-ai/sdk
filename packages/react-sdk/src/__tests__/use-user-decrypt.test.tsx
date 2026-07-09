import type { Address, TypedValue } from "@zama-fhe/sdk";
import { waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { useQueryClient } from "@tanstack/react-query";
import { useHasPermit } from "../permits/use-has-permit";
import { useZamaSDK } from "../provider";
import { useDecryptValues } from "../decrypt/use-user-decrypt";
import { describe, expect, test, vi } from "../test-fixtures";

describe("useDecryptValues", () => {
  test("decrypts encrypted values", async ({ relayer, tokenAddress, renderWithProviders }) => {
    vi.mocked(relayer.decryptValues).mockResolvedValue([
      { type: "uint64", value: 100n } as TypedValue,
      { type: "bool", value: true } as TypedValue,
    ]);

    const { result } = renderWithProviders(() =>
      useDecryptValues(
        [
          { encryptedValue: "0xhandle1", contractAddress: tokenAddress },
          { encryptedValue: "0xhandle2", contractAddress: tokenAddress },
        ],
        { enabled: true },
      ),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });

    expect(result.current.data).toEqual({ "0xhandle1": 100n, "0xhandle2": true });
  });

  test("groups encrypted values by contract address", async ({ relayer, renderWithProviders }) => {
    const CONTRACT_A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
    const CONTRACT_B = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;

    vi.mocked(relayer.decryptValues)
      .mockResolvedValueOnce([{ type: "uint64", value: 10n } as TypedValue])
      .mockResolvedValueOnce([{ type: "uint64", value: 20n } as TypedValue]);

    const { result } = renderWithProviders(() =>
      useDecryptValues(
        [
          { encryptedValue: "0xh1", contractAddress: CONTRACT_A },
          { encryptedValue: "0xh2", contractAddress: CONTRACT_B },
        ],
        { enabled: true },
      ),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });

    expect(relayer.decryptValues).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ "0xh1": 10n, "0xh2": 20n });
  });

  test("reports error when keypair generation fails", async ({
    relayer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(relayer.generateTransportKeyPair).mockRejectedValue(new Error("keygen failed"));

    const { result } = renderWithProviders(() =>
      useDecryptValues([{ encryptedValue: "0xh", contractAddress: tokenAddress }], {
        enabled: true,
      }),
    );

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5_000 });
    expect(result.current.error?.message).toContain("keygen failed");
  });

  test("respects enabled = false", async ({ tokenAddress, renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useDecryptValues([{ encryptedValue: "0xh", contractAddress: tokenAddress }], {
        enabled: false,
      }),
    );

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(result.current.data).toBeUndefined();
  });

  test("stays disabled with empty encrypted values", async ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useDecryptValues([]));

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(result.current.data).toBeUndefined();
  });

  test("is off by default — no signature prompt when enabled is not provided", async ({
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    const { result } = renderWithProviders(() =>
      useDecryptValues([{ encryptedValue: "0xh", contractAddress: tokenAddress }]),
    );

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(signer.signTypedData).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  test("gated on useHasPermit=true fires and decrypts silently without a wallet prompt", async ({
    signer,
    relayer,
    tokenAddress,
    renderWithProviders,
  }) => {
    // SDK-80 row 17: when credentials are already authorized for the contract,
    // useHasPermit resolves to true and useDecryptValues fires automatically —
    // no extra signature prompt should be triggered by the decrypt itself.
    vi.mocked(relayer.decryptValues).mockResolvedValue([
      { type: "uint64", value: 42n } as TypedValue,
    ]);

    const { result } = renderWithProviders(() => {
      const sdk = useZamaSDK();
      const queryClient = useQueryClient();
      // Prime credentials once on mount so isAllowed flips to true,
      // then invalidate so the cached `false` result is re-fetched.
      useEffect(() => {
        void sdk.permits
          .grantPermit([tokenAddress])
          .then(() => queryClient.invalidateQueries({ queryKey: zamaQueryKeys.hasPermit.all }));
      }, [sdk, queryClient]);

      const isAllowed = useHasPermit({ contractAddresses: [tokenAddress] });
      const decrypt = useDecryptValues([{ encryptedValue: "0xh", contractAddress: tokenAddress }], {
        enabled: isAllowed.data === true,
      });
      return { isAllowed, decrypt };
    });

    await waitFor(() => expect(result.current.isAllowed.data).toBe(true));
    await waitFor(() => expect(result.current.decrypt.isSuccess).toBe(true), { timeout: 5_000 });

    expect(result.current.decrypt.data).toEqual({ "0xh": 42n });
    // Exactly one signature: the credential priming. The decrypt itself must
    // not have prompted an additional signature.
    expect(signer.signTypedData).toHaveBeenCalledTimes(1);
  });

  test("gated on useHasPermit=false does not prompt for a signature", async ({
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    // SDK-42 pattern: the consumer gates the decrypt hook on useHasPermit.
    // When no permit covers the contract, isAllowed resolves to false and
    // decrypt must stay idle — no EIP-712 prompt on mount.
    const { result } = renderWithProviders(() => {
      const isAllowed = useHasPermit({ contractAddresses: [tokenAddress] });
      const decrypt = useDecryptValues([{ encryptedValue: "0xh", contractAddress: tokenAddress }], {
        enabled: isAllowed.data === true,
      });
      return { isAllowed, decrypt };
    });

    await waitFor(() => expect(result.current.isAllowed.data).toBe(false));
    await waitFor(() => expect(result.current.decrypt.fetchStatus).toBe("idle"));

    expect(signer.signTypedData).not.toHaveBeenCalled();
    expect(result.current.decrypt.data).toBeUndefined();
  });
});
