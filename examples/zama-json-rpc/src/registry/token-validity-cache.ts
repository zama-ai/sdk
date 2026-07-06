import type { Address } from "viem";
import type { ZamaSDK } from "@zama-fhe/sdk";

interface CacheEntry {
  valid: boolean;
  expiresAt: number;
}

/**
 * Caches `sdk.registry.isConfidentialTokenValid()` results locally.
 *
 * Verified against SDK source (`packages/sdk/src/wrappers-registry.ts`):
 * `isConfidentialTokenValid` does **no caching at all** — every call is a
 * fresh `readContract`. Its sibling `getConfidentialToken` does cache
 * (with a 5-minute negative TTL), so this looks like an inconsistency in
 * the SDK rather than a deliberate choice — worth reporting upstream (see
 * WALKTHROUGH.md).
 *
 * This matters concretely for this wrapper: the registry matches by
 * selector only, and `transfer(address,uint256)` — the shape
 * `confidentialTransfer` reuses for transparency — is the single most
 * common selector in all of Ethereum. Every plain ERC-20 transfer routed
 * through this wrapper would otherwise trigger an uncached on-chain read
 * before being (correctly) passed through unchanged.
 *
 * TTLs mirror the SDK's own convention for `getConfidentialToken`
 * (positive results assumed durable, negative results re-checked
 * periodically in case a token gets registered after the first miss).
 */
export class TokenValidityCache {
  readonly #entries = new Map<string, CacheEntry>();
  readonly #positiveTtlMs: number;
  readonly #negativeTtlMs: number;

  constructor(params: { positiveTtlMs?: number; negativeTtlMs?: number } = {}) {
    this.#positiveTtlMs = params.positiveTtlMs ?? 24 * 60 * 60 * 1000;
    this.#negativeTtlMs = params.negativeTtlMs ?? 5 * 60 * 1000;
  }

  async resolve(sdk: ZamaSDK, address: Address): Promise<boolean> {
    const key = address.toLowerCase();
    const cached = this.#entries.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.valid;
    }

    const valid = await sdk.registry.isConfidentialTokenValid(address);
    this.#entries.set(key, {
      valid,
      expiresAt: now + (valid ? this.#positiveTtlMs : this.#negativeTtlMs),
    });
    return valid;
  }
}
