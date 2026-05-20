import { describe, expectTypeOf, test } from "vitest";
import type { TransferSubmittedEvent, UnwrapSubmittedEvent } from "../../events/sdk-events";
import type { ZamaSDKNodeEventMap } from "../events";

describe("ZamaSDKNodeEventMap", () => {
  test("narrows tuple args per type key", () => {
    expectTypeOf<ZamaSDKNodeEventMap["transfer:submitted"]>().toEqualTypeOf<
      [TransferSubmittedEvent]
    >();
    expectTypeOf<ZamaSDKNodeEventMap["unwrap:submitted"]>().toEqualTypeOf<[UnwrapSubmittedEvent]>();
  });
});
