import type { Address, Hex } from "viem";
import type { GenericStorage } from "../types";
import { PermissionListSchema, ScopeIndexSchema } from "./schemas";
import type { Permission } from "./types";
import { permissionIndexKey, permissionScopeKey } from "./storage-keys";
import {
  deletePermitsTouchingContracts,
  pruneUnusablePermissions,
  upsertPermission,
} from "./permissions";

/** Identifies a 1-to-many permission scope: (signer, chain, delegator). */
export interface PermissionScope {
  signerAddress: Address;
  chainId: number;
  delegatorAddress: Address;
}

interface PermissionStoreConfig {
  storage: GenericStorage;
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

  constructor(config: PermissionStoreConfig) {
    this.#storage = config.storage;
  }

  /** @internal */
  static async scopeKey(scope: PermissionScope): Promise<string> {
    return permissionScopeKey(scope);
  }

  /** @internal */
  static async indexKey(signerAddress: Address): Promise<string> {
    return permissionIndexKey(signerAddress);
  }

  /**
   * Read all stored permissions for the given scope.
   *
   * @returns All valid permissions, or an empty array if none are stored.
   */
  async list(scope: PermissionScope): Promise<Permission[]> {
    const key = await PermissionStore.scopeKey(scope);
    const raw = await this.#storage.get(key);
    if (raw === null || raw === undefined) {
      return [];
    }
    const parsed = PermissionListSchema.safeParse(raw);
    if (!parsed.success) {
      await safeDelete(this.#storage, key);
      return [];
    }
    return parsed.data;
  }

  /**
   * Return permissions that are still live and bound to the current keypair.
   * Expired or stale-keypair permissions are pruned in one storage pass.
   */
  async listUsableAndPrune(scope: PermissionScope, keypairPublicKey: Hex): Promise<Permission[]> {
    const all = await this.list(scope);
    const { permissions, changed } = pruneUnusablePermissions({
      permissions: all,
      keypairPublicKey,
      nowSeconds: Math.floor(Date.now() / 1000),
    });

    if (changed) {
      const key = await PermissionStore.scopeKey(scope);
      if (permissions.length === 0) {
        await safeDelete(this.#storage, key);
      } else {
        await safeSet(this.#storage, key, permissions);
      }
    }

    return permissions;
  }

  /**
   * Append signed permits for the given scope.
   *
   * Signed permit payloads are immutable. Existing entries with the same signed
   * contract set are replaced wholesale; no signed field is edited in place.
   */
  async append(scope: PermissionScope, permissions: readonly Permission[]): Promise<void> {
    if (permissions.length === 0) {
      return;
    }
    const key = await PermissionStore.scopeKey(scope);
    const existing = await this.list(scope);
    const next = permissions.reduce<Permission[]>(
      (acc, permission) => upsertPermission(acc, permission),
      existing,
    );

    await this.#trackScope(scope);
    await this.#storage.set(key, next);
  }

  /**
   * Delete every permit whose signed payload touches any listed contract.
   *
   * The store never edits `signedContractAddresses`, because that field is part
   * of the EIP-712 payload covered by `signature`.
   */
  async deletePermitsTouching(scope: PermissionScope, contractsToRemove: Address[]): Promise<void> {
    const key = await PermissionStore.scopeKey(scope);
    const existing = await this.list(scope);
    if (existing.length === 0) {
      return;
    }
    const next = deletePermitsTouchingContracts(existing, contractsToRemove);
    if (next.length === 0) {
      await safeDelete(this.#storage, key);
    } else {
      await this.#storage.set(key, next);
    }
  }

  /** Delete all permissions for the given scope and remove it from the signer index. */
  async clear(scope: PermissionScope): Promise<void> {
    const key = await PermissionStore.scopeKey(scope);
    await safeDelete(this.#storage, key);
    await this.#untrackScope(scope);
  }

  /**
   * Delete every permission for the given signer across all chains and delegators.
   * Uses the per-signer scope index to cascade without enumerating all storage keys.
   */
  async clearAllForSigner(signerAddress: Address): Promise<void> {
    const indexKey = await PermissionStore.indexKey(signerAddress);
    const list = await this.#readIndex(indexKey);
    for (const entry of list) {
      await safeDelete(this.#storage, entry);
    }
    await safeDelete(this.#storage, indexKey);
  }

  async #readIndex(indexKey: string): Promise<string[]> {
    const raw = await this.#storage.get(indexKey);
    if (raw === null || raw === undefined) {
      return [];
    }
    const parsed = ScopeIndexSchema.safeParse(raw);
    if (!parsed.success) {
      await safeDelete(this.#storage, indexKey);
      return [];
    }
    return parsed.data;
  }

  async #trackScope(scope: PermissionScope): Promise<void> {
    const indexKey = await PermissionStore.indexKey(scope.signerAddress);
    const scopeKey = await PermissionStore.scopeKey(scope);
    const list = await this.#readIndex(indexKey);
    if (!list.includes(scopeKey)) {
      list.push(scopeKey);
      await this.#storage.set(indexKey, list);
    }
  }

  async #untrackScope(scope: PermissionScope): Promise<void> {
    const indexKey = await PermissionStore.indexKey(scope.signerAddress);
    const scopeKey = await PermissionStore.scopeKey(scope);
    const list = await this.#readIndex(indexKey);
    const next = list.filter((entry) => entry !== scopeKey);
    if (next.length === list.length) {
      return;
    }
    try {
      if (next.length === 0) {
        await this.#storage.delete(indexKey);
      } else {
        await this.#storage.set(indexKey, next);
      }
    } catch (error) {
      // oxlint-disable-next-line no-console
      console.warn("[zama-sdk] Failed to update permit index:", error);
    }
  }
}

async function safeDelete(storage: GenericStorage, key: string): Promise<void> {
  try {
    await storage.delete(key);
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.warn("[zama-sdk] Failed to delete permit entry:", error);
  }
}

async function safeSet(storage: GenericStorage, key: string, value: unknown): Promise<void> {
  try {
    await storage.set(key, value);
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.warn("[zama-sdk] Failed to update permit entry:", error);
  }
}
