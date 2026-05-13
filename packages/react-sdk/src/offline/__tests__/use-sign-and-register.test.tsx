import { act } from "@testing-library/react";
import type { CredentialPermitRequest } from "@zama-fhe/sdk";
import { describe, expect, test, vi } from "../../test-fixtures";
import { TOKEN, USER, expectDefaultMutationState } from "../../__tests__/mutation-test-helpers";
import { useSignAndRegister } from "../use-sign-and-register";
import { useZamaSDK } from "../../provider";

const PERMIT_RESULT = {
  contracts: [TOKEN],
  durationDays: 30,
  startTimestamp: 1700000000,
} as const;

describe("useSignAndRegister", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useSignAndRegister());
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("routes a CredentialPermitRequest through sdk.offline.signAndRegister", async ({
    renderWithProviders,
  }) => {
    const { result } = renderWithProviders(() => {
      const sdk = useZamaSDK();
      const mutation = useSignAndRegister();
      return { sdk, mutation };
    });

    const spy = vi
      .spyOn(result.current.sdk.offline, "signAndRegister")
      .mockResolvedValue(PERMIT_RESULT);

    const request: CredentialPermitRequest = {
      kind: "CredentialPermit",
      from: USER,
      contracts: [TOKEN],
    };

    let value: unknown;
    await act(async () => {
      value = await result.current.mutation.mutateAsync({ request });
    });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toEqual(request);
    expect(value).toBe(PERMIT_RESULT);
  });
});
