import { act } from "@testing-library/react";
import { describe, expect, test, vi } from "../../test-fixtures";
import { RECIPIENT, TOKEN, UNDERLYING, WRAPPER } from "../../__tests__/mutation-test-helpers";
import {
  useAllowClearSigningIntent,
  useConfidentialTransferClearSigningIntent,
  useShieldClearSigningIntent,
} from "../use-clear-signing-intents";

describe("clear-signing intent hooks", () => {
  test("generates an allow intent", async ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useAllowClearSigningIntent());

    const intent = await act(() => result.current.mutateAsync({ contracts: [TOKEN] }));

    expect(intent).toMatchObject({
      kind: "allow",
      contractContext: { chainId: 31337 },
    });
  });

  test("generates a confidential transfer intent", async ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useConfidentialTransferClearSigningIntent({ address: TOKEN }),
    );

    const intent = await act(() => result.current.mutateAsync({ to: RECIPIENT, amount: 100n }));

    expect(intent).toMatchObject({
      kind: "confidentialTransfer",
      contractContext: {
        chainId: 31337,
        contractAddress: TOKEN,
        functionName: "confidentialTransfer",
      },
    });
  });

  test("generates a shield intent with resolved route", async ({
    renderWithProviders,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(false);

    const { result } = renderWithProviders(() => useShieldClearSigningIntent({ address: WRAPPER }));

    const intent = await act(() => result.current.mutateAsync({ amount: 100n }));

    expect(intent).toMatchObject({
      kind: "shield",
      contractContext: {
        chainId: 31337,
        contractAddress: WRAPPER,
      },
      rawContext: { route: "approveAndWrap" },
    });
  });
});
