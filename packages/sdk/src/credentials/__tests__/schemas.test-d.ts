import type { z } from "zod/mini";
import { describe, expectTypeOf, test } from "vitest";
import type {
  PermissionSchema,
  SerializedPermitSchema,
  StoredTransportKeyPairSchema,
} from "../schemas";
import type { Permission, SerializedPermit, StoredTransportKeyPair } from "../types";

// Drift guard: the public credential interfaces are hand-written (so the zod
// schemas can stay `@internal` and be stripped from the shipped .d.ts). These
// assertions fail typecheck if a schema and its public type ever diverge.
describe("credential schema/type parity", () => {
  test("StoredTransportKeyPair matches its schema", () => {
    expectTypeOf<
      z.infer<typeof StoredTransportKeyPairSchema>
    >().toEqualTypeOf<StoredTransportKeyPair>();
  });

  test("SerializedPermit matches its schema", () => {
    expectTypeOf<z.infer<typeof SerializedPermitSchema>>().toEqualTypeOf<SerializedPermit>();
  });

  test("Permission matches its schema", () => {
    expectTypeOf<z.infer<typeof PermissionSchema>>().toEqualTypeOf<Permission>();
  });
});
