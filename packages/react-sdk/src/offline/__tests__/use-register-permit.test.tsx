import { act } from "@testing-library/react";
import type { Address, DecryptionPermitResult, PreparedDecryptionPermit } from "@zama-fhe/sdk";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useRegisterPermit } from "../use-register-permit";
import { useZamaSDK } from "../../provider";

const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const USER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;

const PREPARED: PreparedDecryptionPermit = {
  kind: "DecryptionPermit",
  request: { kind: "DecryptionPermit", from: USER, contracts: [TOKEN] },
  from: USER,
  chainId: 31337,
  typedData: null,
  context: {
    keypairPublicKey: "0xpk",
    signerAddress: USER,
    delegatorAddress: USER,
    chainId: 31337,
    chunk: [TOKEN],
    startTimestamp: 1700000000,
  },
};

const RESULT: DecryptionPermitResult = {
  contracts: [TOKEN],
  durationDays: 30,
  startTimestamp: 1700000000,
};

describe("useRegisterPermit", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useRegisterPermit());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;
    expect(state).toEqualDefaultMutationState();
  });

  test("delegates to sdk.offlineSigning.registerPermit", async ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => {
      const sdk = useZamaSDK();
      const mutation = useRegisterPermit();
      return { sdk, mutation };
    });

    const spy = vi
      .spyOn(result.current.sdk.offlineSigning, "registerPermit")
      .mockResolvedValue(RESULT);

    let value: unknown;
    await act(async () => {
      value = await result.current.mutation.mutateAsync({
        preparedPermit: PREPARED,
        signature: "0xsig",
      });
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toBe(PREPARED);
    expect(spy.mock.calls[0]![1]).toBe("0xsig");
    expect(value).toBe(RESULT);
  });
});
