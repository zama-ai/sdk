import type { Address } from "viem";
import { describe, expect, test, vi } from "../../test-fixtures";
import type { GenericProvider } from "../../types";
import { WrappedToken } from "../wrapped-token";

const UNDERLYING = "0x5555555555555555555555555555555555555555" as Address;
const RECIPIENT = "0x3333333333333333333333333333333333333333" as Address;

interface ReadOpts {
  isPayable?: boolean;
  underlying?: Address;
  /** Existing ERC-20 allowance the user has granted the wrapper. Default 0n. */
  allowance?: bigint;
}

/**
 * Stub the chain-read surface the shield planner exercises:
 * - `underlying()` on the wrapper,
 * - `supportsInterface(ERC-1363)` on the underlying,
 * - `allowance(user, wrapper)` on the underlying.
 */
function setupReads(provider: GenericProvider, opts: ReadOpts = {}): void {
  const underlyingAddr = opts.underlying ?? UNDERLYING;
  const isPayable = opts.isPayable ?? false;
  const allowance = opts.allowance ?? 0n;
  vi.mocked(provider.readContract).mockImplementation(async (config: { functionName: string }) => {
    switch (config.functionName) {
      case "underlying":
        return underlyingAddr as never;
      case "supportsInterface":
        return isPayable as never;
      case "allowance":
        return allowance as never;
      default:
        return undefined as never;
    }
  });
}

describe("WrappedToken.prepareShield — routing", () => {
  test("payable (ERC-1363) → single TransferAndCall step", async ({
    createSDK,
    signer,
    provider,
    wrapperAddress,
  }) => {
    setupReads(provider, { isPayable: true });
    const sdk = createSDK({ signer: signer });
    const token = new WrappedToken(sdk, wrapperAddress);
    const plan = await token.prepareShield(500n);
    expect(plan.path).toBe("transferAndCall");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toEqual(
      expect.objectContaining({
        kind: "TransferAndCall",
        underlying: UNDERLYING,
        wrapper: wrapperAddress,
        amount: 500n,
      }),
    );
  });

  test("non-payable underlying → two-step approve + wrap plan", async ({
    createSDK,
    signer,
    provider,
    wrapperAddress,
  }) => {
    setupReads(provider, { isPayable: false });
    const sdk = createSDK({ signer: signer });
    const token = new WrappedToken(sdk, wrapperAddress);
    const plan = await token.prepareShield(500n);
    expect(plan.path).toBe("approveAndWrap");
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]).toEqual(
      expect.objectContaining({
        kind: "ApproveUnderlying",
        underlying: UNDERLYING,
        spender: wrapperAddress,
        amount: 500n,
      }),
    );
    expect(plan.steps[1]).toEqual(
      expect.objectContaining({ kind: "Wrap", wrapper: wrapperAddress, amount: 500n }),
    );
  });

  test("custom recipient propagates to TransferAndCall and Wrap steps", async ({
    createSDK,
    signer,
    provider,
    wrapperAddress,
  }) => {
    const sdk = createSDK({ signer: signer });

    setupReads(provider, { isPayable: true });
    const payable = new WrappedToken(sdk, wrapperAddress);
    const planPayable = await payable.prepareShield(1n, { recipient: RECIPIENT });
    expect(planPayable.steps[0]).toMatchObject({ kind: "TransferAndCall" });

    setupReads(provider, { isPayable: false });
    const nonPayable = new WrappedToken(sdk, wrapperAddress);
    const planNon = await nonPayable.prepareShield(1n, { recipient: RECIPIENT });
    expect(planNon.steps[1]).toMatchObject({ kind: "Wrap", to: RECIPIENT });
  });

  test("the plan steps can be fed back into sdk.offline.prepare", async ({
    createSDK,
    signer,
    provider,
    wrapperAddress,
  }) => {
    setupReads(provider, { isPayable: false });
    const sdk = createSDK({ signer: signer });
    const token = new WrappedToken(sdk, wrapperAddress);
    const plan = await token.prepareShield(750n);
    for (const step of plan.steps) {
      await sdk.offline.prepare(step);
    }
    expect(provider.prepareTransaction).toHaveBeenCalledTimes(plan.steps.length);
  });

  test("non-payable + allowance ≥ amount → single Wrap step (skip approve)", async ({
    createSDK,
    signer,
    provider,
    wrapperAddress,
  }) => {
    setupReads(provider, { isPayable: false, allowance: 1_000n });
    const sdk = createSDK({ signer: signer });
    const token = new WrappedToken(sdk, wrapperAddress);
    const plan = await token.prepareShield(500n);
    expect(plan.path).toBe("approveAndWrap");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({ kind: "Wrap", amount: 500n });
  });

  test("non-payable + 0 < allowance < amount → zero-reset then approve then wrap (USDT-safe)", async ({
    createSDK,
    signer,
    provider,
    wrapperAddress,
  }) => {
    setupReads(provider, { isPayable: false, allowance: 100n });
    const sdk = createSDK({ signer: signer });
    const token = new WrappedToken(sdk, wrapperAddress);
    const plan = await token.prepareShield(500n);
    expect(plan.path).toBe("approveAndWrap");
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0]).toMatchObject({ kind: "ApproveUnderlying", amount: 0n });
    expect(plan.steps[1]).toMatchObject({ kind: "ApproveUnderlying", amount: 500n });
    expect(plan.steps[2]).toMatchObject({ kind: "Wrap", amount: 500n });
  });
});
