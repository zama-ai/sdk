// The recovery check must fail when a known bug is put back. Each case swaps
// one module for a broken copy and expects some scenario to break a rule. If a
// case passes, the check has gone blind: a bound or the model now hides that
// bug, or no scenario reaches it.
import type { Address, Hex } from "viem";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { GenericStorage } from "../../../types";
import type * as SubmitTransactionModule from "../../../utils/submit-transaction";
import type * as PendingUnshieldModule from "../../pending-unshield";

type PendingUnshield = typeof PendingUnshieldModule;
type SubmitTransaction = typeof SubmitTransactionModule;

const CASES: { bug: string; inject: () => void }[] = [
  {
    bug: "the entry is saved only after the unwrap receipt",
    inject: () =>
      vi.doMock("../../../utils/submit-transaction", async (importOriginal) => {
        const real = await importOriginal<SubmitTransaction>();
        return {
          ...real,
          submitTransaction: (params: Parameters<SubmitTransaction["submitTransaction"]>[0]) =>
            real.submitTransaction({ ...params, beforeReceipt: undefined }),
        };
      }),
  },
  {
    bug: "a clear deletes every entry of the wrapper",
    inject: () =>
      vi.doMock("../../pending-unshield", async (importOriginal) => {
        const real = await importOriginal<PendingUnshield>();
        return {
          ...real,
          clearPendingUnshield: (storage: GenericStorage, wrapper: Address) =>
            storage.delete(real.pendingUnshieldsKey(wrapper)),
        };
      }),
  },
  {
    bug: "a save overwrites the other entries",
    inject: () =>
      vi.doMock("../../pending-unshield", async (importOriginal) => {
        const real = await importOriginal<PendingUnshield>();
        return {
          ...real,
          savePendingUnshield: (storage: GenericStorage, wrapper: Address, unwrapTxHash: Hex) =>
            storage.set(
              real.pendingUnshieldsKey(wrapper),
              real.encodePendingUnshields([unwrapTxHash]),
            ),
        };
      }),
  },
  {
    bug: "getPendingUnshield stops at the first entry",
    inject: () =>
      vi.doMock("../../pending-unshield", async (importOriginal) => {
        const real = await importOriginal<PendingUnshield>();
        return {
          ...real,
          loadPendingUnshields: async (storage: GenericStorage, wrapper: Address) =>
            (await real.loadPendingUnshields(storage, wrapper)).slice(0, 1),
        };
      }),
  },
  {
    bug: "a mined receipt that opened no request counts as unknown, so it is kept and reported",
    inject: () =>
      vi.doMock("../../pending-unshield", async (importOriginal) => {
        const real = await importOriginal<PendingUnshield>();
        return {
          ...real,
          judgeUnwrapReceipt: (...args: Parameters<PendingUnshield["judgeUnwrapReceipt"]>) => {
            const [receipt] = args;
            const verdict = real.judgeUnwrapReceipt(...args);
            return verdict === "settled" && receipt?.status !== "reverted" ? "unknown" : verdict;
          },
        };
      }),
  },
];

afterEach(() => {
  vi.doUnmock("../../../utils/submit-transaction");
  vi.doUnmock("../../pending-unshield");
  vi.resetModules();
});

describe("unshield recovery check catches known bugs", () => {
  test.each(CASES)(
    "$bug",
    async ({ inject }) => {
      vi.resetModules();
      inject();
      const { explore } = await import("./explore");
      const { SCENARIOS } = await import("./scenarios");
      const broken: string[] = [];
      for (const scenario of SCENARIOS) {
        const result = await explore(scenario, { stopOnBreak: true });
        broken.push(...[...result.broken.keys()].map((rule) => `${scenario.name}: ${rule}`));
        if (broken.length > 0) {
          break;
        }
      }
      expect(broken, "no scenario breaks a rule, so the check would miss this bug").not.toEqual([]);
    },
    120_000,
  );
});
