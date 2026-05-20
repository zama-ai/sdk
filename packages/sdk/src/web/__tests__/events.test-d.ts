import { describe, expectTypeOf, test } from "vitest";
import type { TransferSubmittedEvent, UnwrapSubmittedEvent } from "../../events/sdk-events";
import type { ZamaSDKWindowEventMap } from "../events";

describe("ZamaSDKWindowEventMap", () => {
  test("narrows CustomEvent detail per type key", () => {
    expectTypeOf<ZamaSDKWindowEventMap["transfer:submitted"]>().toEqualTypeOf<
      CustomEvent<TransferSubmittedEvent>
    >();
    expectTypeOf<ZamaSDKWindowEventMap["unwrap:submitted"]>().toEqualTypeOf<
      CustomEvent<UnwrapSubmittedEvent>
    >();
  });

  test("composes into local WindowEventMap augmentation", () => {
    interface LocalMap extends ZamaSDKWindowEventMap {}
    expectTypeOf<LocalMap["transfer:submitted"]>().toEqualTypeOf<
      CustomEvent<TransferSubmittedEvent>
    >();
  });
});
