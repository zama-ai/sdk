import type { Hex } from "viem";
import type { GenericLogger, GenericStorage } from "../types";
import { swallow } from "../utils/swallow";
import { pruneUnusable, withoutPermitsTouching } from "./permissions";
import { PermissionListSchema, PermissionSchema, ScopeIndexSchema } from "./schemas";
import { permissionIndexKey, permissionScopeKey, type PermissionScope } from "./storage-keys";
import type { Permission } from "./types";
import type { ChecksummedAddress } from "../schemas/primitives";

export type { PermissionScope };

interface PermissionStoreConfig {
  storage: GenericStorage;
  /** SDK-wide logger for best-effort storage diagnostics. */
  logger: GenericLogger;
}

/**
 * Chain-scoped, 1-to-many store of EIP-712 permits.
 *
 * Permits are grouped by `(signerAddress, chainId, delegatorAddress)` so that
 * direct (`delegator === signer`) and delegated permits never collide. An
 * auxiliary per-signer index lists every scope so `clearAllForSigner` can
 * cascade across chains and delegators without enumerating storage keys.
 */
export class PermissionStore {
  readonly #storage: GenericStorage;
  readonly #logger: GenericLogger;

  constructor(config: PermissionStoreConfig) {
    this.#storage = config.storage;
    this.#logger = config.logger;
  }

  /** Read all stored permissions for the given scope. Returns `[]` if none. */
  async list(scope: PermissionScope): Promise<Permission[]> {
    const key = permissionScopeKey(scope);
    const raw = await this.#storage.get(key);
    if (raw === null || raw === undefined) {
      return [];
    }
    const parsed = PermissionListSchema.safeParse(raw);
    if (!parsed.success) {
      await this.#deleteScope(key);
      await this.#untrackScope(scope);
      return [];
    }
    return parsed.data;
  }

  /**
   * Return permissions still live and bound to the current keypair.
   * Expired or stale-keypair permissions are pruned in one storage pass.
   */
  async listUsableAndPrune(scope: PermissionScope, keypairPublicKey: Hex): Promise<Permission[]> {
    const all = await this.list(scope);
    const usable = pruneUnusable(all, keypairPublicKey, Math.floor(Date.now() / 1000));

    if (usable.length !== all.length) {
      const key = permissionScopeKey(scope);
      if (usable.length === 0) {
        await this.#deleteScope(key);
        await this.#untrackScope(scope);
      } else {
        await swallow("update permit entry", () => this.#storage.set(key, usable), this.#logger);
      }
    }
    return usable;
  }

  /**
   * Append signed permits to the given scope. Every permission is run through
   * `PermissionSchema` so the schema is the single normalization point for both
   * read and write paths. Signed payloads themselves are immutable and never
   * edited — only addresses and types are normalized.
   */
  async append(scope: PermissionScope, permissions: readonly Permission[]): Promise<void> {
    if (permissions.length === 0) {
      return;
    }
    const validated = permissions.map((p) => PermissionSchema.parse(p));
    const existing = await this.list(scope);
    await this.#storage.set(permissionScopeKey(scope), [...existing, ...validated]);
    await this.#trackScope(scope);
  }

  /**
   * Replace the entry identified by `oldSignature` with `newPermission`.
   *
   * Atomic relative to the storage backend's `set`: the old entry survives in
   * storage until the new list is written. If `oldSignature` is not found
   * (raced eviction or concurrent prune), `newPermission` is still persisted —
   * equivalent to {@link append}.
   */
  async replace(
    scope: PermissionScope,
    oldSignature: Hex,
    newPermission: Permission,
  ): Promise<void> {
    const validated = PermissionSchema.parse(newPermission);
    const existing = await this.list(scope);
    const filtered = existing.filter((p) => p.serializedPermit.signature !== oldSignature);
    await this.#storage.set(permissionScopeKey(scope), [...filtered, validated]);
    await this.#trackScope(scope);
  }

  /**
   * Delete every permit whose signed payload touches any listed contract.
   *
   * The store never edits `contractAddresses`, because that field is part
   * of the EIP-712 payload covered by `signature`.
   */
  async deletePermitsTouching(
    scope: PermissionScope,
    contractsToRemove: ChecksummedAddress[],
  ): Promise<void> {
    const existing = await this.list(scope);
    if (existing.length === 0) {
      return;
    }
    const key = permissionScopeKey(scope);
    const next = withoutPermitsTouching(existing, contractsToRemove);
    if (next.length === 0) {
      await this.#deleteScope(key);
      await this.#untrackScope(scope);
    } else {
      await this.#storage.set(key, next);
    }
  }

  /**
   * Delete every permission for the given signer across all chains and delegators.
   * Uses the per-signer scope index to cascade without enumerating all storage keys.
   */
  async clearAllForSigner(signerAddress: ChecksummedAddress): Promise<void> {
    const indexKey = permissionIndexKey(signerAddress);
    const scopeKeys = await this.#readIndex(indexKey);
    await Promise.all(scopeKeys.map((k) => this.#deleteScope(k)));
    await swallow("delete permit index", () => this.#storage.delete(indexKey), this.#logger);
  }

  async #readIndex(indexKey: string): Promise<string[]> {
    const raw = await this.#storage.get(indexKey);
    if (raw === null || raw === undefined) {
      return [];
    }
    const parsed = ScopeIndexSchema.safeParse(raw);
    if (!parsed.success) {
      await swallow("delete permit index", () => this.#storage.delete(indexKey), this.#logger);
      return [];
    }
    return parsed.data;
  }

  async #trackScope(scope: PermissionScope): Promise<void> {
    const indexKey = permissionIndexKey(scope.signerAddress);
    const scopeKey = permissionScopeKey(scope);
    const list = await this.#readIndex(indexKey);
    if (list.includes(scopeKey)) {
      return;
    }
    await this.#storage.set(indexKey, [...list, scopeKey]);
  }

  async #untrackScope(scope: PermissionScope): Promise<void> {
    const indexKey = permissionIndexKey(scope.signerAddress);
    const scopeKey = permissionScopeKey(scope);
    const list = await this.#readIndex(indexKey);
    const next = list.filter((entry) => entry !== scopeKey);
    if (next.length === list.length) {
      return;
    }
    if (next.length === 0) {
      await swallow("delete permit index", () => this.#storage.delete(indexKey), this.#logger);
    } else {
      await swallow("update permit index", () => this.#storage.set(indexKey, next), this.#logger);
    }
  }

  async #deleteScope(scopeKey: string): Promise<void> {
    await swallow("delete permit entry", () => this.#storage.delete(scopeKey), this.#logger);
  }
}
