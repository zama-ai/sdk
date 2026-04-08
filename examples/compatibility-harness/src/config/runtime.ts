function normalizeBoolean(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isMockModeEnabled(): boolean {
  const normalized = normalizeBoolean(process.env.HARNESS_MOCK_MODE);
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function mockModeNote(): string {
  return "HARNESS_MOCK_MODE is enabled. Network, relayer, and registry dependent checks are marked UNTESTED.";
}
