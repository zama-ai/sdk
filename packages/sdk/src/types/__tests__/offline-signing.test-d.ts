import { expectTypeOf, test } from "vitest";
import type { z } from "zod/mini";
import type {
  approveUnderlyingRequest,
  confidentialTransferFromRequest,
  confidentialTransferRequest,
  delegateDecryptionRequest,
  fees,
  finalizeUnwrapRequest,
  prepareOptions,
  prepareTransactionRequest,
  revokeDelegationRequest,
  setOperatorRequest,
  transferAndCallRequest,
  unwrapAllRequest,
  unwrapRequest,
  wrapRequest,
} from "../../schemas/offline";
import type {
  ApproveUnderlyingRequest,
  ConfidentialTransferFromRequest,
  ConfidentialTransferRequest,
  DelegateDecryptionRequest,
  FinalizeUnwrapRequest,
  PrepareFees,
  PrepareOptions,
  PrepareTransactionRequest,
  RevokeDelegationRequest,
  SetOperatorRequest,
  TransferAndCallRequest,
  UnwrapAllRequest,
  UnwrapRequest,
  WrapRequest,
} from "../offline-signing";

test("ConfidentialTransferRequest matches its schema", () => {
  expectTypeOf<
    z.input<typeof confidentialTransferRequest>
  >().toEqualTypeOf<ConfidentialTransferRequest>();
});

test("ConfidentialTransferFromRequest matches its schema", () => {
  expectTypeOf<
    z.input<typeof confidentialTransferFromRequest>
  >().toEqualTypeOf<ConfidentialTransferFromRequest>();
});

test("SetOperatorRequest matches its schema", () => {
  expectTypeOf<z.input<typeof setOperatorRequest>>().toEqualTypeOf<SetOperatorRequest>();
});

test("UnwrapRequest matches its schema", () => {
  expectTypeOf<z.input<typeof unwrapRequest>>().toEqualTypeOf<UnwrapRequest>();
});

test("UnwrapAllRequest matches its schema", () => {
  expectTypeOf<z.input<typeof unwrapAllRequest>>().toEqualTypeOf<UnwrapAllRequest>();
});

test("FinalizeUnwrapRequest matches its schema", () => {
  expectTypeOf<z.input<typeof finalizeUnwrapRequest>>().toEqualTypeOf<FinalizeUnwrapRequest>();
});

test("ApproveUnderlyingRequest matches its schema", () => {
  expectTypeOf<
    z.input<typeof approveUnderlyingRequest>
  >().toEqualTypeOf<ApproveUnderlyingRequest>();
});

test("WrapRequest matches its schema", () => {
  expectTypeOf<z.input<typeof wrapRequest>>().toEqualTypeOf<WrapRequest>();
});

test("TransferAndCallRequest matches its schema", () => {
  expectTypeOf<z.input<typeof transferAndCallRequest>>().toEqualTypeOf<TransferAndCallRequest>();
});

test("DelegateDecryptionRequest matches its schema input", () => {
  expectTypeOf<
    z.input<typeof delegateDecryptionRequest>
  >().toEqualTypeOf<DelegateDecryptionRequest>();
});

test("RevokeDelegationRequest matches its schema", () => {
  expectTypeOf<z.input<typeof revokeDelegationRequest>>().toEqualTypeOf<RevokeDelegationRequest>();
});

test("PrepareTransactionRequest matches the union schema input", () => {
  expectTypeOf<
    z.input<typeof prepareTransactionRequest>
  >().toEqualTypeOf<PrepareTransactionRequest>();
});

test("PrepareFees matches its schema", () => {
  expectTypeOf<z.input<typeof fees>>().toEqualTypeOf<PrepareFees>();
});

test("PrepareOptions matches its schema", () => {
  expectTypeOf<z.input<typeof prepareOptions>>().toEqualTypeOf<PrepareOptions>();
});
