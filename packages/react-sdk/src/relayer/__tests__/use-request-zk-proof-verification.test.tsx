import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "../../test-fixtures";
import { useRequestZKProofVerification } from "../use-request-zk-proof-verification";

describe("useRequestZKProofVerification", () => {
  it("delegates to relayer.requestZKProofVerification", async ({
    renderWithProviders,
    relayer,
  }) => {
    const { result } = renderWithProviders(() => useRequestZKProofVerification());

    result.current.mutate({} as unknown as Parameters<typeof result.current.mutate>[0]);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.requestZKProofVerification).toHaveBeenCalledOnce();
  });
});
