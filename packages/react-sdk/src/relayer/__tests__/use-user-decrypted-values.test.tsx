import { hashFn } from "@zama-fhe/sdk/query";
import { describe, expect, it } from "../../test-fixtures";
import { decryptionKeys } from "../decryption-cache";
import { useUserDecryptedValues } from "../use-user-decrypted-values";

describe("useUserDecryptedValues", () => {
  it("reads multiple handles from cache", ({ renderWithProviders }) => {
    const { result, queryClient } = renderWithProviders(() =>
      useUserDecryptedValues(["0xh1", "0xh2"]),
    );

    expect(result.current.data).toEqual({
      "0xh1": undefined,
      "0xh2": undefined,
    });
    expect(result.current.results).toHaveLength(2);

    const query1 = queryClient.getQueryCache().find({ queryKey: decryptionKeys.value("0xh1") });
    const query2 = queryClient.getQueryCache().find({ queryKey: decryptionKeys.value("0xh2") });
    expect(query1?.options.queryKeyHashFn).toBe(hashFn);
    expect(query2?.options.queryKeyHashFn).toBe(hashFn);
  });

  it("returns empty for empty handles", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useUserDecryptedValues([]));
    expect(result.current.data).toEqual({});
    expect(result.current.results).toHaveLength(0);
  });
});
