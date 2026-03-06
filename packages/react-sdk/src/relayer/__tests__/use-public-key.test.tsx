import { describe, expect, test } from "../../test-fixtures";
import { waitFor } from "@testing-library/react";
import { usePublicKey } from "../use-public-key";

describe("usePublicKey", () => {
  test("default", async ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => usePublicKey());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { data, dataUpdatedAt } = result.current;
    expect(data).toEqual({
      publicKeyId: "pk-1",
      publicKey: new Uint8Array([1]),
    });
    expect(dataUpdatedAt).toEqual(expect.any(Number));
  });
});
