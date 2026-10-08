import { bytesToHex } from "viem";
import type { PrepareOptions, PrepareTransactionRequest, TransactionKind } from "@zama-fhe/sdk";
import type * as rpc from "./generated/zama/sdk/v1beta1/daemon.js";
import { TransactionKind as WireTransactionKind } from "./generated/zama/sdk/v1beta1/daemon.js";
import type { ContextSdk } from "./runtime.js";
import {
  address,
  bytes,
  delegateDecryptionParams,
  integer,
  revokeDelegationParams,
  safeInteger,
} from "./encoding.js";
import { invalidArgument } from "./errors.js";

const wireKinds: Record<TransactionKind, rpc.TransactionKind> = {
  ConfidentialTransfer: WireTransactionKind.TRANSACTION_KIND_CONFIDENTIAL_TRANSFER,
  ConfidentialTransferFrom: WireTransactionKind.TRANSACTION_KIND_CONFIDENTIAL_TRANSFER_FROM,
  SetOperator: WireTransactionKind.TRANSACTION_KIND_SET_OPERATOR,
  Unwrap: WireTransactionKind.TRANSACTION_KIND_UNWRAP,
  UnwrapAll: WireTransactionKind.TRANSACTION_KIND_UNWRAP_ALL,
  FinalizeUnwrap: WireTransactionKind.TRANSACTION_KIND_FINALIZE_UNWRAP,
  ApproveUnderlying: WireTransactionKind.TRANSACTION_KIND_APPROVE_UNDERLYING,
  Wrap: WireTransactionKind.TRANSACTION_KIND_WRAP,
  TransferAndCall: WireTransactionKind.TRANSACTION_KIND_TRANSFER_AND_CALL,
  DelegateDecryption: WireTransactionKind.TRANSACTION_KIND_DELEGATE_DECRYPTION,
  RevokeDelegation: WireTransactionKind.TRANSACTION_KIND_REVOKE_DELEGATION,
};

function transactionRequest(request: rpc.PrepareTransactionRequest): PrepareTransactionRequest {
  const from = address(request.from);
  const transaction = request.transaction;
  switch (transaction?.$case) {
    case "confidentialTransfer": {
      const value = transaction.confidentialTransfer;
      return {
        kind: "ConfidentialTransfer",
        from,
        token: address(value.token),
        to: address(value.to),
        amount: integer(value.amount, "Amount"),
      };
    }
    case "confidentialTransferFrom": {
      const value = transaction.confidentialTransferFrom;
      return {
        kind: "ConfidentialTransferFrom",
        from,
        token: address(value.token),
        owner: address(value.owner),
        to: address(value.to),
        amount: integer(value.amount, "Amount"),
      };
    }
    case "setOperator": {
      const value = transaction.setOperator;
      if (value.until === undefined) {
        throw invalidArgument("Operator expiry is required.");
      }
      return {
        kind: "SetOperator",
        from,
        token: address(value.token),
        operator: address(value.operator),
        until: safeInteger(value.until, "Operator expiry"),
      };
    }
    case "unwrap": {
      const value = transaction.unwrap;
      return {
        kind: "Unwrap",
        from,
        token: address(value.token),
        to: address(value.to),
        amount: integer(value.amount, "Amount"),
      };
    }
    case "unwrapAll": {
      const value = transaction.unwrapAll;
      return { kind: "UnwrapAll", from, token: address(value.token), to: address(value.to) };
    }
    case "finalizeUnwrap": {
      const value = transaction.finalizeUnwrap;
      return {
        kind: "FinalizeUnwrap",
        from,
        wrapper: address(value.wrapper),
        unwrapRequestIdOrAmount: bytesToHex(value.unwrapRequestIdOrAmount),
      };
    }
    case "approveUnderlying": {
      const value = transaction.approveUnderlying;
      return {
        kind: "ApproveUnderlying",
        from,
        underlying: address(value.underlying),
        spender: address(value.spender),
        amount: integer(value.amount, "Amount"),
      };
    }
    case "wrap": {
      const value = transaction.wrap;
      return {
        kind: "Wrap",
        from,
        wrapper: address(value.wrapper),
        to: address(value.to),
        amount: integer(value.amount, "Amount"),
      };
    }
    case "transferAndCall": {
      const value = transaction.transferAndCall;
      return {
        kind: "TransferAndCall",
        from,
        underlying: address(value.underlying),
        wrapper: address(value.wrapper),
        amount: integer(value.amount, "Amount"),
        ...(value.recipientData === undefined
          ? {}
          : { recipientData: bytesToHex(value.recipientData) }),
      };
    }
    case "delegateDecryption":
      return {
        kind: "DelegateDecryption",
        from,
        ...delegateDecryptionParams(transaction.delegateDecryption),
      };
    case "revokeDelegation":
      return {
        kind: "RevokeDelegation",
        from,
        ...revokeDelegationParams(transaction.revokeDelegation),
      };
    default:
      transaction satisfies undefined;
      throw invalidArgument("An offline transaction kind is required.");
  }
}

function prepareOptions(value: rpc.PrepareOptions | undefined): PrepareOptions | undefined {
  if (value === undefined) {
    return undefined;
  }
  return {
    ...(value.nonce === undefined ? {} : { nonce: safeInteger(value.nonce, "Nonce") }),
    ...(value.gasLimit === undefined ? {} : { gasLimit: integer(value.gasLimit, "Gas limit") }),
    ...(value.fees === undefined
      ? {}
      : {
          fees: {
            maxFeePerGas: integer(value.fees.maxFeePerGas, "Max fee per gas"),
            maxPriorityFeePerGas: integer(
              value.fees.maxPriorityFeePerGas,
              "Max priority fee per gas",
            ),
          },
        }),
  };
}

export async function prepareTransaction(
  sdk: ContextSdk,
  request: rpc.PrepareTransactionRequest,
): Promise<rpc.PrepareTransactionResponse> {
  const result = await sdk.offline.prepare(
    transactionRequest(request),
    prepareOptions(request.options),
  );
  return {
    kind: wireKinds[result.kind],
    from: bytes(result.from),
    unsignedTx: bytes(result.unsignedTx),
  };
}
