/**
 * Minimal EIP-1193 provider interface — the subset of methods that
 * LedgerWebHIDProvider implements and that ZamaSDK calls.
 *
 * Defined here as a shared type used by both LedgerWebHIDProvider.ts
 * (implementation) and providers.tsx / page.tsx (consumers).
 */
export type EIP1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
};
