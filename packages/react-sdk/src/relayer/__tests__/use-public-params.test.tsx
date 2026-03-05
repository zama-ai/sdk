import { describe, expect, test } from "../../test-fixtures";
import { waitFor } from "@testing-library/react";
import { usePublicParams } from "../use-public-params";

describe("usePublicParams", () => {
  test("default", async ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => usePublicParams(2048));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { data, dataUpdatedAt } = result.current;
    expect(data).toEqual({
      publicParams: new Uint8Array([2]),
      publicParamsId: "pp-1",
    });
    expect(dataUpdatedAt).toEqual(expect.any(Number));
  });
});
