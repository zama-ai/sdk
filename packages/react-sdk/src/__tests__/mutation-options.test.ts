import { expect, it } from "../test-fixtures";
import type { Token, Address, ZamaSDK } from "@zama-fhe/sdk";
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
import { allowMutationOptions } from "../token/use-allow";
import { encryptMutationOptions } from "../relayer/use-encrypt";

const TOKEN_ADDR = "0xtoken" as Address;

const MOCK_TX_RESULT = { txHash: "0xtx" as `0x${string}`, receipt: { logs: [] } };

it("confidentialTransferMutationOptions", async ({ createMockToken }) => {
  const token = createMockToken({
    txResult: MOCK_TX_RESULT,
    address: TOKEN_ADDR,
  }) as unknown as Token;
  const opts = confidentialTransferMutationOptions(token);

  expect(opts.mutationKey).toEqual(["confidentialTransfer", TOKEN_ADDR]);
  await opts.mutationFn({ to: "0xto" as Address, amount: 100n });
  expect(token.confidentialTransfer).toHaveBeenCalledWith("0xto", 100n, undefined);
});

it("confidentialTransferFromMutationOptions", async ({ createMockToken }) => {
  const token = createMockToken({
    txResult: MOCK_TX_RESULT,
    address: TOKEN_ADDR,
  }) as unknown as Token;
  const opts = confidentialTransferFromMutationOptions(token);

  expect(opts.mutationKey).toEqual(["confidentialTransferFrom", TOKEN_ADDR]);
  await opts.mutationFn({ from: "0xfrom" as Address, to: "0xto" as Address, amount: 100n });
  expect(token.confidentialTransferFrom).toHaveBeenCalledWith("0xfrom", "0xto", 100n, undefined);
});

it("confidentialApproveMutationOptions", async ({ createMockToken }) => {
  const token = createMockToken({
    txResult: MOCK_TX_RESULT,
    address: TOKEN_ADDR,
  }) as unknown as Token;
  const opts = confidentialApproveMutationOptions(token);

  expect(opts.mutationKey).toEqual(["confidentialApprove", TOKEN_ADDR]);
  await opts.mutationFn({ spender: "0xspender" as Address });
  expect(token.approve).toHaveBeenCalledWith("0xspender", undefined);
});

it("approveUnderlyingMutationOptions", async ({ createMockToken }) => {
  const token = createMockToken({
    txResult: MOCK_TX_RESULT,
    address: TOKEN_ADDR,
  }) as unknown as Token;
  const opts = approveUnderlyingMutationOptions(token);

  expect(opts.mutationKey).toEqual(["approveUnderlying", TOKEN_ADDR]);
  await opts.mutationFn({ amount: 500n });
  expect(token.approveUnderlying).toHaveBeenCalledWith(500n);
});

it("shieldMutationOptions", async ({ createMockToken }) => {
  const token = createMockToken({
    txResult: MOCK_TX_RESULT,
    address: TOKEN_ADDR,
  }) as unknown as Token;
  const opts = shieldMutationOptions(token);

  expect(opts.mutationKey).toEqual(["shield", TOKEN_ADDR]);
  await opts.mutationFn({ amount: 1000n });
  expect(token.shield).toHaveBeenCalledWith(1000n, {
    fees: undefined,
    approvalStrategy: undefined,
  });
});

it("shieldETHMutationOptions", async ({ createMockToken }) => {
  const token = createMockToken({
    txResult: MOCK_TX_RESULT,
    address: TOKEN_ADDR,
  }) as unknown as Token;
  const opts = shieldETHMutationOptions(token);

  expect(opts.mutationKey).toEqual(["shieldETH", TOKEN_ADDR]);
  await opts.mutationFn({ amount: 1000n, value: 2000n });
  expect(token.shieldETH).toHaveBeenCalledWith(1000n, 2000n);
});

it("unwrapMutationOptions", async ({ createMockToken }) => {
  const token = createMockToken({
    txResult: MOCK_TX_RESULT,
    address: TOKEN_ADDR,
  }) as unknown as Token;
  const opts = unwrapMutationOptions(token);

  expect(opts.mutationKey).toEqual(["unwrap", TOKEN_ADDR]);
  await opts.mutationFn({ amount: 500n });
  expect(token.unwrap).toHaveBeenCalledWith(500n);
});

it("unwrapAllMutationOptions", async ({ createMockToken }) => {
  const token = createMockToken({
    txResult: MOCK_TX_RESULT,
    address: TOKEN_ADDR,
  }) as unknown as Token;
  const opts = unwrapAllMutationOptions(token);

  expect(opts.mutationKey).toEqual(["unwrapAll", TOKEN_ADDR]);
  await opts.mutationFn();
  expect(token.unwrapAll).toHaveBeenCalled();
});

it("finalizeUnwrapMutationOptions", async ({ createMockToken }) => {
  const token = createMockToken({
    txResult: MOCK_TX_RESULT,
    address: TOKEN_ADDR,
  }) as unknown as Token;
  const opts = finalizeUnwrapMutationOptions(token);

  expect(opts.mutationKey).toEqual(["finalizeUnwrap", TOKEN_ADDR]);
  await opts.mutationFn({ burnAmountHandle: "0xhandle" as Address });
  expect(token.finalizeUnwrap).toHaveBeenCalledWith("0xhandle");
});

it("unshieldMutationOptions", async ({ createMockToken }) => {
  const token = createMockToken({
    txResult: MOCK_TX_RESULT,
    address: TOKEN_ADDR,
  }) as unknown as Token;
  const opts = unshieldMutationOptions(token);

  expect(opts.mutationKey).toEqual(["unshield", TOKEN_ADDR]);
  await opts.mutationFn({ amount: 300n });
  expect(token.unshield).toHaveBeenCalledWith(300n, undefined);
});

it("unshieldAllMutationOptions", async ({ createMockToken }) => {
  const token = createMockToken({
    txResult: MOCK_TX_RESULT,
    address: TOKEN_ADDR,
  }) as unknown as Token;
  const opts = unshieldAllMutationOptions(token);

  expect(opts.mutationKey).toEqual(["unshieldAll", TOKEN_ADDR]);
  await opts.mutationFn();
  expect(token.unshieldAll).toHaveBeenCalledWith(undefined);
});

it("resumeUnshieldMutationOptions", async ({ createMockToken }) => {
  const token = createMockToken({
    txResult: MOCK_TX_RESULT,
    address: TOKEN_ADDR,
  }) as unknown as Token;
  const opts = resumeUnshieldMutationOptions(token);

  expect(opts.mutationKey).toEqual(["resumeUnshield", TOKEN_ADDR]);
  const txHash = "0xabc" as `0x${string}`;
  await opts.mutationFn({ unwrapTxHash: txHash });
  expect(token.resumeUnshield).toHaveBeenCalledWith(txHash, undefined);
});

it("allowMutationOptions", async ({ sdk }) => {
  const opts = allowMutationOptions(sdk as unknown as ZamaSDK);

  expect(opts.mutationKey).toEqual(["allow"]);
  // mutationFn creates ReadonlyToken instances and calls ReadonlyToken.allow — just verify it doesn't throw on empty
  // We can't fully test without mocking static methods, so just verify the key
});

it("encryptMutationOptions", async ({ sdk, relayer }) => {
  const opts = encryptMutationOptions(sdk as unknown as ZamaSDK);

  expect(opts.mutationKey).toEqual(["encrypt"]);
  const params = {
    values: [{ value: 1000n, type: "euint64" as const }],
    contractAddress: "0xtoken" as Address,
    userAddress: "0xuser" as Address,
  };
  await opts.mutationFn(params);
  expect(relayer.encrypt).toHaveBeenCalledWith(params);
});
