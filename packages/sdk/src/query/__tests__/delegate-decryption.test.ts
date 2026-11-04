import { describe, expect, test, vi, withMembers } from "../../test-fixtures";
import { delegateDecryptionMutationOptions } from "../delegate-decryption";
import type { Address } from "viem";

const TOKEN = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const DELEGATE = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;

describe("delegateDecryptionMutationOptions", () => {
  test("delegates delegateDecryption", async ({ sdk: realSdk }) => {
    const spy = vi.fn().mockResolvedValue({ txHash: "0x", receipt: { logs: [] } });
    const sdk = withMembers(realSdk, {
      delegations: withMembers(realSdk.delegations, { delegateDecryption: spy }),
    });
    const options = delegateDecryptionMutationOptions(sdk, TOKEN);

    expect(options.mutationKey).toEqual(["zama.delegateDecryption", TOKEN]);
    await options.mutationFn({ delegateAddress: DELEGATE });
    expect(spy).toHaveBeenCalledWith({
      contractAddress: TOKEN,
      delegateAddress: DELEGATE,
      expirationDate: undefined,
    });
  });

  test("passes options through", async ({ sdk: realSdk }) => {
    const spy = vi.fn().mockResolvedValue({ txHash: "0x", receipt: { logs: [] } });
    const sdk = withMembers(realSdk, {
      delegations: withMembers(realSdk.delegations, { delegateDecryption: spy }),
    });
    const options = delegateDecryptionMutationOptions(sdk, TOKEN);
    const expirationDate = new Date("2030-01-01");

    await options.mutationFn({ delegateAddress: DELEGATE, expirationDate });
    expect(spy).toHaveBeenCalledWith({
      contractAddress: TOKEN,
      delegateAddress: DELEGATE,
      expirationDate,
    });
  });
});
