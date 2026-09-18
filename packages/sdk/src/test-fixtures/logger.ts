import { vi } from "vitest";

export const makeLogger = () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() });

export type MockLogger = ReturnType<typeof makeLogger>;
