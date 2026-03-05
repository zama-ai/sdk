import { describe, expect, it, vi } from "../test-fixtures";
import { waitFor } from "@testing-library/react";
import { useGenerateKeypair } from "../relayer/use-generate-keypair";
import { useCreateEIP712 } from "../relayer/use-create-eip712";
import { useCreateDelegatedUserDecryptEIP712 } from "../relayer/use-create-delegated-user-decrypt-eip712";
import { useUserDecrypt } from "../relayer/use-user-decrypt";
import { usePublicDecrypt } from "../relayer/use-public-decrypt";
import { useDelegatedUserDecrypt } from "../relayer/use-delegated-user-decrypt";
import { useRequestZKProofVerification } from "../relayer/use-request-zk-proof-verification";
import { useUserDecryptedValue } from "../relayer/use-user-decrypted-value";
import { useUserDecryptedValues } from "../relayer/use-user-decrypted-values";
import { decryptionKeys } from "../relayer/decryption-cache";

describe("decryptionKeys", () => {
  it("produces stable query keys", () => {
    expect(decryptionKeys.value("0xhandle1")).toEqual(["decryptedValue", "0xhandle1"]);
  });
});

describe("useGenerateKeypair", () => {
  it("delegates to relayer.generateKeypair", async ({ relayer, renderWithProviders }) => {
    const { result } = renderWithProviders(() => useGenerateKeypair(), { relayer });

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.generateKeypair).toHaveBeenCalledOnce();
    expect(result.current.data).toEqual({ publicKey: "0xpub", privateKey: "0xpriv" });
  });
});

describe("useCreateEIP712", () => {
  it("delegates to relayer.createEIP712", async ({ relayer, renderWithProviders }) => {
    const { result } = renderWithProviders(() => useCreateEIP712(), { relayer });

    result.current.mutate({
      publicKey: "0xpub",
      contractAddresses: ["0xtoken"],
      startTimestamp: 1000,
      durationDays: 2,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.createEIP712).toHaveBeenCalledWith("0xpub", ["0xtoken"], 1000, 2);
  });

  it("passes undefined for optional durationDays", async ({ relayer, renderWithProviders }) => {
    const { result } = renderWithProviders(() => useCreateEIP712(), { relayer });

    result.current.mutate({
      publicKey: "0xpub",
      contractAddresses: ["0xtoken"],
      startTimestamp: 1000,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.createEIP712).toHaveBeenCalledWith("0xpub", ["0xtoken"], 1000, undefined);
  });
});

describe("useCreateDelegatedUserDecryptEIP712", () => {
  it("delegates to relayer.createDelegatedUserDecryptEIP712", async ({
    relayer,
    renderWithProviders,
  }) => {
    const { result } = renderWithProviders(() => useCreateDelegatedUserDecryptEIP712(), {
      relayer,
    });

    result.current.mutate({
      publicKey: "0xpub",
      contractAddresses: ["0xtoken"],
      delegatorAddress: "0xdelegator",
      startTimestamp: 1000,
      durationDays: 3,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.createDelegatedUserDecryptEIP712).toHaveBeenCalledWith(
      "0xpub",
      ["0xtoken"],
      "0xdelegator",
      1000,
      3,
    );
  });

  it("passes undefined for optional durationDays", async ({ relayer, renderWithProviders }) => {
    const { result } = renderWithProviders(() => useCreateDelegatedUserDecryptEIP712(), {
      relayer,
    });

    result.current.mutate({
      publicKey: "0xpub",
      contractAddresses: ["0xtoken"],
      delegatorAddress: "0xdelegator",
      startTimestamp: 1000,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.createDelegatedUserDecryptEIP712).toHaveBeenCalledWith(
      "0xpub",
      ["0xtoken"],
      "0xdelegator",
      1000,
      undefined,
    );
  });
});

describe("useUserDecrypt", () => {
  it("delegates to relayer.userDecrypt and populates cache", async ({
    relayer,
    renderWithProviders,
  }) => {
    vi.mocked(relayer.userDecrypt).mockResolvedValue({
      "0xhandle1": 100n,
      "0xhandle2": 200n,
    });

    const { result, queryClient } = renderWithProviders(() => useUserDecrypt(), {
      relayer,
    });

    result.current.mutate({
      handles: ["0xhandle1", "0xhandle2"],
      contractAddress: "0xtoken" as `0x${string}`,
      signedContractAddresses: ["0xtoken" as `0x${string}`],
      privateKey: "0xpriv",
      publicKey: "0xpub",
      signature: "0xsig",
      signerAddress: "0xuser" as `0x${string}`,
      startTimestamp: 1000,
      durationDays: 1,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.userDecrypt).toHaveBeenCalledOnce();

    // Check decryption cache was populated
    expect(queryClient.getQueryData(decryptionKeys.value("0xhandle1"))).toBe(100n);
    expect(queryClient.getQueryData(decryptionKeys.value("0xhandle2"))).toBe(200n);
  });
});

describe("usePublicDecrypt", () => {
  it("delegates to relayer.publicDecrypt and populates cache", async ({
    relayer,
    renderWithProviders,
  }) => {
    vi.mocked(relayer.publicDecrypt).mockResolvedValue({
      clearValues: { "0xhandle1": 500n },
      abiEncodedClearValues: "0x",
      decryptionProof: "0xproof",
    });

    const { result, queryClient } = renderWithProviders(() => usePublicDecrypt(), {
      relayer,
    });

    result.current.mutate(["0xhandle1"]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.publicDecrypt).toHaveBeenCalledWith(["0xhandle1"]);

    // Check decryption cache was populated
    expect(queryClient.getQueryData(decryptionKeys.value("0xhandle1"))).toBe(500n);
  });
});

describe("useDelegatedUserDecrypt", () => {
  it("delegates to relayer.delegatedUserDecrypt", async ({ relayer, renderWithProviders }) => {
    vi.mocked(relayer.delegatedUserDecrypt).mockResolvedValue({ "0xhandle1": 300n });

    const { result } = renderWithProviders(() => useDelegatedUserDecrypt(), {
      relayer,
    });

    result.current.mutate({
      handles: ["0xhandle1"],
      contractAddress: "0xtoken" as `0x${string}`,
      signedContractAddresses: ["0xtoken" as `0x${string}`],
      privateKey: "0xpriv",
      publicKey: "0xpub",
      signature: "0xsig",
      delegatorAddress: "0xdelegator" as `0x${string}`,
      delegateAddress: "0xdelegate" as `0x${string}`,
      startTimestamp: 1000,
      durationDays: 1,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.delegatedUserDecrypt).toHaveBeenCalledOnce();
    expect(result.current.data).toEqual({ "0xhandle1": 300n });
  });
});

describe("useRequestZKProofVerification", () => {
  it("delegates to relayer.requestZKProofVerification", async ({
    relayer,
    renderWithProviders,
  }) => {
    const { result } = renderWithProviders(() => useRequestZKProofVerification(), {
      relayer,
    });

    result.current.mutate({} as unknown as Parameters<typeof result.current.mutate>[0]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.requestZKProofVerification).toHaveBeenCalledOnce();
  });
});

describe("useUserDecryptedValue", () => {
  it("reads from decryption cache", ({ renderWithProviders }) => {
    const { result, queryClient } = renderWithProviders(() => useUserDecryptedValue("0xhandle1"));

    // Initially no data
    expect(result.current.data).toBeUndefined();

    // Populate cache manually
    queryClient.setQueryData(decryptionKeys.value("0xhandle1"), 42n);
    // The query is disabled so it won't refetch - data comes from cache seed
  });

  it("handles undefined handle", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useUserDecryptedValue(undefined));
    expect(result.current.data).toBeUndefined();
  });
});

describe("useUserDecryptedValues", () => {
  it("reads multiple handles from cache", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useUserDecryptedValues(["0xh1", "0xh2"]));

    expect(result.current.data).toEqual({
      "0xh1": undefined,
      "0xh2": undefined,
    });
    expect(result.current.results).toHaveLength(2);
  });

  it("returns empty for empty handles", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useUserDecryptedValues([]));
    expect(result.current.data).toEqual({});
    expect(result.current.results).toHaveLength(0);
  });
});
