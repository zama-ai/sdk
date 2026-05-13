import { act } from "@testing-library/react";
import type { CredentialPermitResult, PreparedCredentialPermit } from "@zama-fhe/sdk";
import { describe, expect, test, vi } from "../../test-fixtures";
import { TOKEN, USER, expectDefaultMutationState } from "../../__tests__/mutation-test-helpers";
import { useRegisterPermit } from "../use-register-permit";
import { useZamaSDK } from "../../provider";

const PREPARED: PreparedCredentialPermit = {
  kind: "CredentialPermit",
  request: { kind: "CredentialPermit", from: USER, contracts: [TOKEN] },
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

const RESULT: CredentialPermitResult = {
  contracts: [TOKEN],
  durationDays: 30,
  startTimestamp: 1700000000,
};

describe("useRegisterPermit", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useRegisterPermit());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;
    expectDefaultMutationState(state);
  });

  test("delegates to sdk.offline.registerPermit", async ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => {
      const sdk = useZamaSDK();
      const mutation = useRegisterPermit();
      return { sdk, mutation };
    });

    const spy = vi.spyOn(result.current.sdk.offline, "registerPermit").mockResolvedValue(RESULT);

    let value: unknown;
    await act(async () => {
      value = await result.current.mutation.mutateAsync({
        prepared: PREPARED,
        signature: "0xsig",
      });
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toBe(PREPARED);
    expect(spy.mock.calls[0]![1]).toBe("0xsig");
    expect(value).toBe(RESULT);
  });
});
