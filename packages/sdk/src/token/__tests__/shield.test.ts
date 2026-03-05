import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { Address } from "../../relayer/relayer-sdk.types";
import { Token } from "../token";
import type { GenericSigner } from "../token.types";
import { MemoryStorage } from "../memory-storage";
import { createMockRelayer, createMockSigner } from "./test-utils";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
const UNDERLYING = "0x9999999999999999999999999999999999999999" as Address;
const VALID_HANDLE = ("0x" + "ab".repeat(32)) as Address;

describe("Token.shield", () => {
  let sdk: ReturnType<typeof createMockRelayer>;
  let signer: GenericSigner;
  let token: Token;

  beforeEach(() => {
    sdk = createMockRelayer();
    signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValue(UNDERLYING);
    token = new Token({
      relayer: sdk as unknown as RelayerSDK,
      signer,
      storage: new MemoryStorage(),
      sessionStorage: new MemoryStorage(),
      address: TOKEN,
      wrapper: TOKEN,
    });
  });

  it("fires onApprovalSubmitted and onShieldSubmitted callbacks", async () => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);

    const onApprovalSubmitted = vi.fn();
    const onShieldSubmitted = vi.fn();

    await token.shield(100n, {
      callbacks: { onApprovalSubmitted, onShieldSubmitted },
    });

    expect(onApprovalSubmitted).toHaveBeenCalledWith("0xtxhash");
    expect(onShieldSubmitted).toHaveBeenCalledWith("0xtxhash");
  });

  it("skips onApprovalSubmitted when allowance is sufficient", async () => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(1000n);

    const onApprovalSubmitted = vi.fn();
    const onShieldSubmitted = vi.fn();

    await token.shield(100n, {
      callbacks: { onApprovalSubmitted, onShieldSubmitted },
    });

    expect(onApprovalSubmitted).not.toHaveBeenCalled();
    expect(onShieldSubmitted).toHaveBeenCalledOnce();
  });

  it("completes shield even when callbacks throw", async () => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);

    const result = await token.shield(100n, {
      callbacks: {
        onApprovalSubmitted: () => {
          throw new Error("callback exploded");
        },
        onShieldSubmitted: () => {
          throw new Error("callback exploded again");
        },
      },
    });

    expect(result.txHash).toBe("0xtxhash");
  });

  it("passes to parameter for shield recipient", async () => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(1000n);

    const recipient = "0x8888888888888888888888888888888888888888" as Address;
    await token.shield(100n, { to: recipient });

    expect(signer.writeContract).toHaveBeenCalled();
  });

  it("performs full shield flow with exact approval", async () => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce(UNDERLYING)
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(VALID_HANDLE);

    const shieldResult = await token.shield(500n);
    expect(shieldResult.txHash).toBe("0xtxhash");

    expect(signer.writeContract).toHaveBeenCalledTimes(2);
    expect(signer.writeContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ functionName: "approve", args: expect.arrayContaining([500n]) }),
    );
    expect(signer.writeContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ functionName: "wrap" }),
    );

    const handle = await token.confidentialBalanceOf();
    expect(handle).toBe(VALID_HANDLE);

    const balance = await token.decryptBalance(handle);
    expect(balance).toBe(1000n);
    expect(sdk.userDecrypt).toHaveBeenCalledWith(
      expect.objectContaining({ handles: [VALID_HANDLE] }),
    );
  });
});
