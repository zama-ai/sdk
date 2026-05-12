import type { Address, Hex } from "viem";
import {
  createMockChain,
  createMockProvider,
  createMockRelayer,
  describe,
  expect,
  test,
  vi,
} from "../../test-fixtures";
import type { ZamaConfig } from "../../config/types";
import { BroadcastSigner } from "../../signer/broadcast-signer";
import { MemoryStorage } from "../../storage/memory-storage";
import { Token } from "../token";
import type { Broadcaster, GenericProvider } from "../../types";
import { ZamaSDK } from "../../zama-sdk";

const ACCOUNT = {
  address: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address,
  chainId: 31337,
};
const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const WRAPPER = "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D" as Address;
const UNDERLYING = "0x5555555555555555555555555555555555555555" as Address;
const RECIPIENT = "0x3333333333333333333333333333333333333333" as Address;
const UNSIGNED = "0xunsigned" as Hex;
const TX_HASH = "0xtxhash" as Hex;

interface BuildOptions {
  isPayable?: boolean;
  underlying?: Address;
}

function makeBroadcaster(): Broadcaster {
  return {
    signTransaction: vi.fn(async () => "0xsignedtx" as Hex),
    signTypedData: vi.fn(async () => ("0x" + "ab".repeat(65)) as Hex),
  };
}

function buildSDKAndToken(opts: BuildOptions = {}) {
  const broadcaster = makeBroadcaster();
  const signer = new BroadcastSigner({ account: ACCOUNT, broadcaster });
  const underlyingAddr = opts.underlying ?? UNDERLYING;
  const isPayable = opts.isPayable ?? false;
  const provider: GenericProvider = createMockProvider({
    getChainId: vi.fn().mockResolvedValue(31337),
    prepareTransaction: vi.fn().mockResolvedValue(UNSIGNED),
    sendRawTransaction: vi.fn().mockResolvedValue(TX_HASH),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    readContract: vi.fn().mockImplementation(async (config: { functionName: string }) => {
      if (config.functionName === "supportsInterface") {return isPayable;}
      if (config.functionName === "underlying") {return underlyingAddr;}
      return undefined;
    }),
  });
  const relayer = createMockRelayer();
  const storage = new MemoryStorage();
  const sdk = new ZamaSDK({
    chains: [createMockChain({ id: 31337 })],
    relayer: relayer as unknown as ZamaConfig["relayer"],
    provider,
    signer,
    storage,
    permitStorage: storage,
    keypairTTL: 2592000,
    permitTTL: 1,
    registryTTL: 86400,
    onEvent: undefined,
  } as unknown as ZamaConfig);
  const token = new Token(sdk, TOKEN, WRAPPER);
  return { sdk, token, provider, relayer, broadcaster };
}

describe("Token.prepareConfidentialTransfer + completeConfidentialTransfer", () => {
  test("prepares with the token address baked in, completes via completeFromTxHash", async () => {
    const { token, provider } = buildSDKAndToken();
    const prepared = await token.prepareConfidentialTransfer({ to: RECIPIENT, amount: 100n });
    expect(prepared.kind).toBe("ConfidentialTransfer");
    expect(prepared.request).toEqual(
      expect.objectContaining({ kind: "ConfidentialTransfer", token: TOKEN, amount: 100n }),
    );

    const externalTxHash = "0xexternalhash" as Hex;
    const result = await token.completeConfidentialTransfer(prepared, externalTxHash);
    expect(provider.sendRawTransaction).not.toHaveBeenCalled();
    expect(provider.waitForTransactionReceipt).toHaveBeenCalledWith(externalTxHash);
    expect(result.txHash).toBe(externalTxHash);
  });
});

describe("Token.prepareShield — routing", () => {
  test("payable (ERC-1363) → single TransferAndCall step", async () => {
    const { token } = buildSDKAndToken({ isPayable: true });
    const plan = await token.prepareShield(500n);
    expect(plan.path).toBe("transferAndCall");
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toEqual(
      expect.objectContaining({
        kind: "TransferAndCall",
        underlying: UNDERLYING,
        wrapper: WRAPPER,
        amount: 500n,
      }),
    );
  });

  test("non-payable underlying → two-step approve + wrap plan", async () => {
    const { token } = buildSDKAndToken({ isPayable: false });
    const plan = await token.prepareShield(500n);
    expect(plan.path).toBe("approveAndWrap");
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0]).toEqual(
      expect.objectContaining({
        kind: "ApproveUnderlying",
        underlying: UNDERLYING,
        spender: WRAPPER,
        amount: 500n,
      }),
    );
    expect(plan.steps[1]).toEqual(
      expect.objectContaining({
        kind: "Wrap",
        wrapper: WRAPPER,
        amount: 500n,
      }),
    );
  });

  test("custom recipient propagates to TransferAndCall and Wrap steps", async () => {
    const { token: payable } = buildSDKAndToken({ isPayable: true });
    const planPayable = await payable.prepareShield(1n, { recipient: RECIPIENT });
    expect(planPayable.steps[0]).toMatchObject({ kind: "TransferAndCall" });

    const { token: nonPayable } = buildSDKAndToken({ isPayable: false });
    const planNon = await nonPayable.prepareShield(1n, { recipient: RECIPIENT });
    expect(planNon.steps[1]).toMatchObject({ kind: "Wrap", to: RECIPIENT });
  });

  test("the plan steps can be fed back into sdk.prepare", async () => {
    const { sdk, token, provider } = buildSDKAndToken({ isPayable: false });
    const plan = await token.prepareShield(750n);
    for (const step of plan.steps) {
      await sdk.prepare(step);
    }
    // 1 call per step
    expect(provider.prepareTransaction).toHaveBeenCalledTimes(plan.steps.length);
  });
});

describe("Token.prepareDelegateDecryption + completeDelegateDecryption", () => {
  test("resolves ACL address via the relayer and bakes in the token", async () => {
    const { token, relayer, provider } = buildSDKAndToken();
    const prepared = await token.prepareDelegateDecryption({ delegateAddress: RECIPIENT });
    expect(relayer.getAclAddress).toHaveBeenCalled();
    expect(prepared.kind).toBe("DelegateDecryption");
    expect(provider.prepareTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({ functionName: "delegateForUserDecryption" }),
      }),
    );
  });
});
