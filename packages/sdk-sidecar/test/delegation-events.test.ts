import {
  BaseSigner,
  SigningRejectedError,
  anvil,
  type Hex,
  type ZamaSDKEvent,
} from "@zama-fhe/sdk";
import { bytesToHex } from "viem";
import { expect, test, vi } from "vitest";
import { DELEGATE, TOKEN, USER } from "../../sdk/src/test-fixtures/constants.js";
import {
  SdkEventKind,
  EventOperation,
  type EventServerMessage,
} from "../src/generated/zama/sdk/v1alpha1/sidecar.js";
import { operationContext } from "../src/remote-signer.js";
import { RemoteEvents, type EventStream } from "../src/remote-events.js";
import { FakeStream } from "./support/fake-stream.js";
import { fixture } from "./support/harness.js";

const HASH = `0x${"ab".repeat(32)}` as Hex;
const account = { address: USER, chainId: anvil.id };

class DelegationSigner extends BaseSigner {
  write = vi.fn(async () => HASH);
  constructor() {
    super(account);
  }
  override async signTypedData(): Promise<Hex> {
    return "0x01";
  }
  override writeContract = this.write;
}

function deliveries(stream: FakeStream<EventServerMessage>) {
  return stream.messages.flatMap((frame) =>
    frame.message?.$case === "delivery" && frame.message.delivery.payload?.$case === "event"
      ? [{ delivery: frame.message.delivery, event: frame.message.delivery.payload.event }]
      : [],
  );
}

test("SDK delegation grants and revokes keep event order, hashes and RPC correlation", async () => {
  const signer = new DelegationSigner();
  const direct: ZamaSDKEvent[] = [];
  const observer = new RemoteEvents("delegation-context");
  const stream = new FakeStream<EventServerMessage>();
  observer.attach(stream as unknown as EventStream);
  const sdk = fixture(signer, undefined, undefined, (event) => {
    direct.push(event);
    observer.onEvent(event);
  });
  vi.mocked(sdk.provider.readContract)
    .mockResolvedValueOnce(0n as never)
    .mockResolvedValueOnce((2n ** 64n - 1n) as never);
  vi.mocked(sdk.provider.waitForTransactionReceipt).mockResolvedValue({ logs: [] });
  try {
    await operationContext.run({ id: "grant-rpc", signal: new AbortController().signal }, () =>
      sdk.sdk.delegations.delegateDecryption({ contractAddress: TOKEN, delegateAddress: DELEGATE }),
    );
    await operationContext.run({ id: "revoke-rpc", signal: new AbortController().signal }, () =>
      sdk.sdk.delegations.revokeDelegation({ contractAddress: TOKEN, delegateAddress: DELEGATE }),
    );
    expect(direct.map((event) => event.type)).toEqual([
      "delegation:submitted",
      "revokeDelegation:submitted",
    ]);
    expect(
      deliveries(stream).map(({ delivery, event }) => ({
        contextId: delivery.contextId,
        operationId: delivery.operationId,
        type: event.type,
        hash: event.txHash && bytesToHex(event.txHash),
      })),
    ).toEqual([
      {
        contextId: "delegation-context",
        operationId: "grant-rpc",
        type: SdkEventKind.SDK_EVENT_KIND_DELEGATION_SUBMITTED,
        hash: HASH,
      },
      {
        contextId: "delegation-context",
        operationId: "revoke-rpc",
        type: SdkEventKind.SDK_EVENT_KIND_REVOKE_DELEGATION_SUBMITTED,
        hash: HASH,
      },
    ]);
  } finally {
    sdk.sdk.dispose();
    signer.dispose();
    observer.dispose();
  }
});

test("a rejected delegation write emits one correlated transaction error", async () => {
  const signer = new DelegationSigner();
  const rejection = new SigningRejectedError("Wallet declined");
  signer.write.mockRejectedValue(rejection);
  const observer = new RemoteEvents("delegation-context");
  const stream = new FakeStream<EventServerMessage>();
  observer.attach(stream as unknown as EventStream);
  const sdk = fixture(signer, undefined, undefined, observer.onEvent);
  vi.mocked(sdk.provider.readContract).mockResolvedValue(0n as never);
  try {
    await expect(
      operationContext.run({ id: "failed-grant", signal: new AbortController().signal }, () =>
        sdk.sdk.delegations.delegateDecryption({
          contractAddress: TOKEN,
          delegateAddress: DELEGATE,
        }),
      ),
    ).rejects.toBe(rejection);
    expect(
      deliveries(stream).map(({ delivery, event }) => ({
        operationId: delivery.operationId,
        type: event.type,
        operation: event.operation,
        errorCode: event.error?.code,
      })),
    ).toEqual([
      {
        operationId: "failed-grant",
        type: SdkEventKind.SDK_EVENT_KIND_TRANSACTION_ERROR,
        operation: EventOperation.EVENT_OPERATION_DELEGATE_DECRYPTION,
        errorCode: "SIGNING_REJECTED",
      },
    ]);
  } finally {
    sdk.sdk.dispose();
    signer.dispose();
    observer.dispose();
  }
});

test("a failed delegation receipt delivers submitted then transaction error in order", async () => {
  const signer = new DelegationSigner();
  const observer = new RemoteEvents("delegation-context");
  const stream = new FakeStream<EventServerMessage>();
  observer.attach(stream as unknown as EventStream);
  const sdk = fixture(signer, undefined, undefined, observer.onEvent);
  vi.mocked(sdk.provider.readContract).mockResolvedValue(0n as never);
  vi.mocked(sdk.provider.waitForTransactionReceipt).mockRejectedValue(new Error("RPC reverted"));
  try {
    await expect(
      operationContext.run({ id: "failed-receipt", signal: new AbortController().signal }, () =>
        sdk.sdk.delegations.delegateDecryption({
          contractAddress: TOKEN,
          delegateAddress: DELEGATE,
        }),
      ),
    ).rejects.toMatchObject({ code: "TRANSACTION_REVERTED" });
    expect(
      deliveries(stream).map(({ delivery, event }) => ({
        operationId: delivery.operationId,
        type: event.type,
        hash: event.txHash && bytesToHex(event.txHash),
        errorCode: event.error?.code,
      })),
    ).toEqual([
      {
        operationId: "failed-receipt",
        type: SdkEventKind.SDK_EVENT_KIND_DELEGATION_SUBMITTED,
        hash: HASH,
        errorCode: undefined,
      },
      {
        operationId: "failed-receipt",
        type: SdkEventKind.SDK_EVENT_KIND_TRANSACTION_ERROR,
        hash: undefined,
        errorCode: "TRANSACTION_REVERTED",
      },
    ]);
  } finally {
    sdk.sdk.dispose();
    signer.dispose();
    observer.dispose();
  }
});
