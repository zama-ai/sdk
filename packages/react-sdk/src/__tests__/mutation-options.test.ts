import { expect, it, vi } from "vitest";
import type { Token, Address } from "@zama-fhe/sdk";
import { confidentialTransferMutationOptions } from "../token/use-confidential-transfer";
import { confidentialTransferFromMutationOptions } from "../token/use-confidential-transfer-from";
import { confidentialApproveMutationOptions } from "../token/use-confidential-approve";
import { approveUnderlyingMutationOptions } from "../token/use-approve-underlying";
import { shieldMutationOptions } from "../token/use-shield";
import { shieldETHMutationOptions } from "../token/use-shield-eth";
import { unwrapMutationOptions } from "../token/use-unwrap";
import { unwrapAllMutationOptions } from "../token/use-unwrap-all";
import { finalizeUnwrapMutationOptions } from "../token/use-finalize-unwrap";
import { unshieldMutationOptions } from "../token/use-unshield";
import { unshieldAllMutationOptions } from "../token/use-unshield-all";
import { resumeUnshieldMutationOptions } from "../token/use-resume-unshield";
import { authorizeAllMutationOptions } from "../token/use-authorize-all";
import { encryptMutationOptions } from "../relayer/use-encrypt";
import { createMockSigner, createMockRelayer, createMockStorage } from "./test-utils";

const TOKEN_ADDR = "0xtoken" as Address;

const MOCK_TX_RESULT = { txHash: "0xtx", receipt: { logs: [] } };

function createMockToken(address: Address = TOKEN_ADDR) {
  return {
    address,
    signer: createMockSigner(),
    confidentialTransfer: vi.fn().mockResolvedValue(MOCK_TX_RESULT),
    confidentialTransferFrom: vi.fn().mockResolvedValue(MOCK_TX_RESULT),
    approve: vi.fn().mockResolvedValue(MOCK_TX_RESULT),
    approveUnderlying: vi.fn().mockResolvedValue(MOCK_TX_RESULT),
    shield: vi.fn().mockResolvedValue(MOCK_TX_RESULT),
    shieldETH: vi.fn().mockResolvedValue(MOCK_TX_RESULT),
    unwrap: vi.fn().mockResolvedValue(MOCK_TX_RESULT),
    unwrapAll: vi.fn().mockResolvedValue(MOCK_TX_RESULT),
    finalizeUnwrap: vi.fn().mockResolvedValue(MOCK_TX_RESULT),
    unshield: vi.fn().mockResolvedValue(MOCK_TX_RESULT),
    unshieldAll: vi.fn().mockResolvedValue(MOCK_TX_RESULT),
    resumeUnshield: vi.fn().mockResolvedValue(MOCK_TX_RESULT),
  } as unknown as Token;
}

it("confidentialTransferMutationOptions", async () => {
  const token = createMockToken();
  const opts = confidentialTransferMutationOptions(token);

  expect(opts.mutationKey).toEqual(["confidentialTransfer", TOKEN_ADDR]);
  await opts.mutationFn({ to: "0xto" as Address, amount: 100n });
  expect(token.confidentialTransfer).toHaveBeenCalledWith("0xto", 100n);
});

it("confidentialTransferFromMutationOptions", async () => {
  const token = createMockToken();
  const opts = confidentialTransferFromMutationOptions(token);

  expect(opts.mutationKey).toEqual(["confidentialTransferFrom", TOKEN_ADDR]);
  await opts.mutationFn({ from: "0xfrom" as Address, to: "0xto" as Address, amount: 100n });
  expect(token.confidentialTransferFrom).toHaveBeenCalledWith("0xfrom", "0xto", 100n);
});

it("confidentialApproveMutationOptions", async () => {
  const token = createMockToken();
  const opts = confidentialApproveMutationOptions(token);

  expect(opts.mutationKey).toEqual(["confidentialApprove", TOKEN_ADDR]);
  await opts.mutationFn({ spender: "0xspender" as Address });
  expect(token.approve).toHaveBeenCalledWith("0xspender", undefined);
});

it("approveUnderlyingMutationOptions", async () => {
  const token = createMockToken();
  const opts = approveUnderlyingMutationOptions(token);

  expect(opts.mutationKey).toEqual(["approveUnderlying", TOKEN_ADDR]);
  await opts.mutationFn({ amount: 500n });
  expect(token.approveUnderlying).toHaveBeenCalledWith(500n);
});

it("shieldMutationOptions", async () => {
  const token = createMockToken();
  const opts = shieldMutationOptions(token);

  expect(opts.mutationKey).toEqual(["shield", TOKEN_ADDR]);
  await opts.mutationFn({ amount: 1000n });
  expect(token.shield).toHaveBeenCalledWith(1000n, {
    fees: undefined,
    approvalStrategy: undefined,
  });
});

it("shieldETHMutationOptions", async () => {
  const token = createMockToken();
  const opts = shieldETHMutationOptions(token);

  expect(opts.mutationKey).toEqual(["shieldETH", TOKEN_ADDR]);
  await opts.mutationFn({ amount: 1000n, value: 2000n });
  expect(token.shieldETH).toHaveBeenCalledWith(1000n, 2000n);
});

it("unwrapMutationOptions", async () => {
  const token = createMockToken();
  const opts = unwrapMutationOptions(token);

  expect(opts.mutationKey).toEqual(["unwrap", TOKEN_ADDR]);
  await opts.mutationFn({ amount: 500n });
  expect(token.unwrap).toHaveBeenCalledWith(500n);
});

it("unwrapAllMutationOptions", async () => {
  const token = createMockToken();
  const opts = unwrapAllMutationOptions(token);

  expect(opts.mutationKey).toEqual(["unwrapAll", TOKEN_ADDR]);
  await opts.mutationFn();
  expect(token.unwrapAll).toHaveBeenCalled();
});

it("finalizeUnwrapMutationOptions", async () => {
  const token = createMockToken();
  const opts = finalizeUnwrapMutationOptions(token);

  expect(opts.mutationKey).toEqual(["finalizeUnwrap", TOKEN_ADDR]);
  await opts.mutationFn({ burnAmountHandle: "0xhandle" as Address });
  expect(token.finalizeUnwrap).toHaveBeenCalledWith("0xhandle");
});

it("unshieldMutationOptions", async () => {
  const token = createMockToken();
  const opts = unshieldMutationOptions(token);

  expect(opts.mutationKey).toEqual(["unshield", TOKEN_ADDR]);
  await opts.mutationFn({ amount: 300n });
  expect(token.unshield).toHaveBeenCalledWith(300n, undefined);
});

it("unshieldAllMutationOptions", async () => {
  const token = createMockToken();
  const opts = unshieldAllMutationOptions(token);

  expect(opts.mutationKey).toEqual(["unshieldAll", TOKEN_ADDR]);
  await opts.mutationFn();
  expect(token.unshieldAll).toHaveBeenCalledWith(undefined);
});

it("resumeUnshieldMutationOptions", async () => {
  const token = createMockToken();
  const opts = resumeUnshieldMutationOptions(token);

  expect(opts.mutationKey).toEqual(["resumeUnshield", TOKEN_ADDR]);
  const txHash = "0xabc" as `0x${string}`;
  await opts.mutationFn({ unwrapTxHash: txHash });
  expect(token.resumeUnshield).toHaveBeenCalledWith(txHash, undefined);
});

it("authorizeAllMutationOptions", async () => {
  const relayer = createMockRelayer();
  const signer = createMockSigner();
  const storage = createMockStorage();
  // We need a real-ish TokenSDK to test this
  const { TokenSDK: TokenSDKClass } = await import("@zama-fhe/sdk");
  const sdk = new TokenSDKClass({ relayer, signer, storage });
  const opts = authorizeAllMutationOptions(sdk);

  expect(opts.mutationKey).toEqual(["authorizeAll"]);
  // mutationFn creates ReadonlyToken instances and calls authorizeAll — just verify it doesn't throw on empty
  // We can't fully test without mocking static methods, so just verify the key
});

it("encryptMutationOptions", async () => {
  const relayer = createMockRelayer();
  const signer = createMockSigner();
  const storage = createMockStorage();
  const { TokenSDK: TokenSDKClass } = await import("@zama-fhe/sdk");
  const sdk = new TokenSDKClass({ relayer, signer, storage });
  const opts = encryptMutationOptions(sdk);

  expect(opts.mutationKey).toEqual(["encrypt"]);
  const params = {
    values: [1000n],
    contractAddress: "0xtoken" as Address,
    userAddress: "0xuser" as Address,
  };
  await opts.mutationFn(params);
  expect(relayer.encrypt).toHaveBeenCalledWith(params);
});
