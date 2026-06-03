import type { Fixtures } from "@vitest/runner";

/**
 * Alias for vitest's own `Fixtures<T, ExtraContext>` mapped type — lets each
 * fixture-group module type its object literal so it can be passed directly
 * to `.extend<T>()` in the builder chain.
 */
export type FixturesOf<T, Deps = object> = Fixtures<T, Deps>;
