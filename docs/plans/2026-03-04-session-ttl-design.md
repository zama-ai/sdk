# Session TTL Design (SDK-11)

## Summary

Add a global `sessionTTL` config option controlling how long EIP-712 session signatures remain valid before requiring re-authentication. Three modes: `"persistent"` (default, current behavior), numeric seconds (auto-expire), and `0` (never persist — re-sign every operation).

## Architecture

### Storage change

Session storage currently stores a bare signature string per `address:chainId` key. Replace with a structured entry:

```typescript
type SessionTTL = "persistent" | number;

interface SessionEntry {
  signature: string;
  createdAt: number; // epoch seconds
  ttl: SessionTTL; // TTL at creation time (not current config)
}
```

### TTL check (lazy, no timers)

```typescript
#isSessionExpired(entry: SessionEntry): boolean {
  if (entry.ttl === "persistent") return false;
  if (entry.ttl === 0) return true;
  return Math.floor(Date.now() / 1000) - entry.createdAt >= entry.ttl;
}
```

Checked in `allow()` and `isAllowed()` at operation time. No background timers.

### Expiry behavior

When a session is found expired:

1. Delete the session entry from session storage.
2. Emit `session:expired` event with `reason: "ttl"`.
3. Fall through to re-sign path (single wallet popup, no keypair regen).

FHE keypair in persistent storage is unaffected.

### TTL `0` semantics

Every `allow()` call triggers a re-sign. The entry is stored briefly for the current operation's decrypt but is expired by the next call.

### Per-entry TTL

Each session entry records the TTL at creation time. If config changes between sessions, old entries use their recorded TTL.

### Backward compatibility

When reading session storage, if the value is a bare string (old format), treat as `{ signature: value, createdAt: 0, ttl: "persistent" }`.

## Files to modify

| File                     | Change                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `credentials-manager.ts` | Add `SessionEntry` type, `sessionTTL` config, `#isSessionExpired()`, update `allow()`/`create()`/`isAllowed()` |
| `sdk-events.ts`          | Add `SessionExpired` event                                                                                     |
| `zama-sdk.ts`            | Add `sessionTTL` to `ZamaSDKConfig`, pass to `CredentialsManager`                                              |
| `token.types.ts`         | Export `SessionTTL` type                                                                                       |
| `index.ts`               | Re-export `SessionTTL`                                                                                         |

## Interaction with existing revocation

TTL expiry and disconnect/account-change revocation are independent. Whichever fires first wins.

## Tests

1. Session with TTL, operation before expiry → valid, no re-auth.
2. Session with TTL, operation after expiry → cleared, `SessionExpired` fires, re-auth required.
3. Session with TTL, disconnect before expiry → revoked (existing behavior).
4. `sessionTTL: 0` → every operation triggers signing prompt.
5. TTL expiry does not clear FHE keypair in persistent storage.
6. Chain switch with active TTL → independent sessions unaffected.
7. Config change between sessions → old sessions use their recorded TTL.
