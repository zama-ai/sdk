/// <reference lib="dom" />
import { bytesToHex } from "viem";
import { describe, expect, test, vi } from "../../sdk/src/test-fixtures/index.js";
import { Topics } from "../../sdk/src/events/index.js";
import type { ZamaSDKEvent } from "../../sdk/src/events/sdk-events.js";
import type { GenericProvider } from "../../sdk/src/types/index.js";
import type { Address } from "viem";
import { sdkEvent } from "../src/event-encoding.js";
import {
  ProgressKind,
  type SdkEventKind,
  type EventServerMessage,
} from "../src/generated/zama/sdk/v1alpha1/sidecar.js";
import { progressCallbacks } from "../src/progress-callbacks.js";
import { RemoteEvents, type EventStream } from "../src/remote-events.js";
import { operationContext } from "../src/remote-signer.js";
import { FakeStream } from "./support/fake-stream.js";

const HASH = `0x${"ab".repeat(32)}` as const;
type Observation = { event: SdkEventKind } | { kind: ProgressKind; txHash?: string };

function directCallbacks(observations: Observation[]) {
  const notify = (kind: ProgressKind, txHash?: string) => {
    observations.push({ kind, txHash });
  };
  return {
    onEncryptComplete: () => notify(ProgressKind.PROGRESS_KIND_ENCRYPT_COMPLETE),
    onTransferSubmitted: (hash: `0x${string}`) =>
      notify(ProgressKind.PROGRESS_KIND_TRANSFER_SUBMITTED, hash),
    onApprovalSubmitted: (hash: `0x${string}`) =>
      notify(ProgressKind.PROGRESS_KIND_APPROVAL_SUBMITTED, hash),
    onShieldSubmitted: (hash: `0x${string}`) =>
      notify(ProgressKind.PROGRESS_KIND_SHIELD_SUBMITTED, hash),
    onUnwrapSubmitted: (hash: `0x${string}`) =>
      notify(ProgressKind.PROGRESS_KIND_UNWRAP_SUBMITTED, hash),
    onFinalizing: () => notify(ProgressKind.PROGRESS_KIND_FINALIZING),
    onFinalizeSubmitted: (hash: `0x${string}`) =>
      notify(ProgressKind.PROGRESS_KIND_FINALIZE_SUBMITTED, hash),
  };
}

function configureProvider(provider: GenericProvider, scenario: string, user: Address) {
  vi.mocked(provider.readContract).mockReset();
  if (scenario === "shield") {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(1000n)
      .mockResolvedValueOnce(0n);
  }
  vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
    logs:
      scenario === "unshield"
        ? [
            {
              topics: [
                Topics.UnwrapRequested,
                `0x${"0".repeat(24)}${user.slice(2)}`,
                `0x${"ff".repeat(32)}`,
              ],
              data: `0x${"ff".repeat(32)}`,
            },
          ]
        : [],
  });
}

describe("SDK progress callback equivalence", () => {
  for (const scenario of ["transfer", "shield", "unshield"] as const) {
    test(`${scenario} preserves callback payloads and interleaving with SDK events`, async ({
      createSDK,
      createToken,
      createWrappedToken,
      signer,
      provider,
      userAddress,
    }) => {
      vi.mocked(signer.writeContract).mockResolvedValue(HASH);
      const direct: Observation[] = [];
      const events = new RemoteEvents("progress-context");
      const stream = new FakeStream<EventServerMessage>();
      events.attach(stream as unknown as EventStream);

      for (const adapted of [false, true]) {
        configureProvider(provider, scenario, userAddress);
        const onEvent = adapted
          ? events.onEvent
          : (event: ZamaSDKEvent) => {
              direct.push({ event: sdkEvent(event).type });
            };
        const sdk = createSDK({ onEvent });
        const callbacks = adapted ? progressCallbacks(events) : directCallbacks(direct);
        const token = createToken(sdk);
        const wrapped = createWrappedToken(sdk);
        try {
          const result = await operationContext.run(
            { id: "progress-operation", signal: new AbortController().signal },
            () => {
              switch (scenario) {
                case "transfer":
                  return token.confidentialTransfer(userAddress, 50n, {
                    ...callbacks,
                    skipBalanceCheck: true,
                  });
                case "shield":
                  return wrapped.shield(50n, callbacks);
                case "unshield":
                  return wrapped.unshield(50n, { ...callbacks, skipBalanceCheck: true });
                default:
                  throw new Error("Unknown progress scenario");
              }
            },
          );
          expect(result.txHash).toBe(HASH);
        } finally {
          sdk.dispose();
        }
      }

      const adapted: Observation[] = [];
      for (const frame of stream.messages) {
        if (frame.message?.$case !== "delivery") {
          continue;
        }
        const delivery = frame.message.delivery;
        expect(delivery.contextId).toBe("progress-context");
        expect(delivery.operationId).toBe("progress-operation");
        const payload = delivery.payload;
        if (payload?.$case === "event") {
          adapted.push({ event: payload.event.type });
        }
        if (payload?.$case === "progress") {
          adapted.push({
            kind: payload.progress.kind,
            txHash:
              payload.progress.txHash === undefined
                ? undefined
                : bytesToHex(payload.progress.txHash),
          });
        }
      }
      expect(adapted).toEqual(direct);
      expect(adapted.filter((item) => "kind" in item)).toHaveLength(
        scenario === "unshield" ? 3 : 2,
      );
      events.dispose();
    });
  }

  test("a failed progress sink is swallowed by the SDK", async ({ token, signer }) => {
    vi.mocked(signer.writeContract).mockResolvedValue(HASH);
    const events = new RemoteEvents("failed-progress");
    const notify = vi.spyOn(events, "notify").mockImplementation(() => {
      throw new Error("subscriber failed");
    });
    const result = await token.confidentialTransfer(token.address, 50n, {
      ...progressCallbacks(events),
      skipBalanceCheck: true,
    });
    expect(result.txHash).toBe(HASH);
    expect(notify).toHaveBeenCalledTimes(2);
    events.dispose();
  });
});
