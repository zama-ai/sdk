import { useQuery } from "@tanstack/react-query";
import { hashFn } from "@zama-fhe/sdk/query";
import { describe, expect, test } from "../../test-fixtures";
import { vi } from "vitest";
import { useIsAllowed } from "../use-is-allowed";

vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return { ...actual, useQuery: vi.fn(() => ({ data: true })) };
});

describe("useIsAllowed", () => {
  test("passes the shared queryKeyHashFn", ({ renderWithProviders }) => {
    renderWithProviders(() => useIsAllowed());

    expect(vi.mocked(useQuery)).toHaveBeenCalledWith(
      expect.objectContaining({ queryKeyHashFn: hashFn }),
    );
  });
});
