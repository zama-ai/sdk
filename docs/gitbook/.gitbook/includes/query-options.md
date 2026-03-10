### `enabled`

**Type:** `boolean`

Set to `false` to prevent the query from running automatically. The query will only execute when `refetch` is called or when `enabled` changes to `true`.

### `staleTime`

**Type:** `number` (milliseconds)

How long fetched data is considered fresh. While fresh, the query will not re-fetch on mount or window focus. Defaults to `0` (always stale).

### `gcTime`

**Type:** `number` (milliseconds)

How long inactive query data stays in the cache before garbage collection. Defaults to `300000` (5 minutes).

### `refetchInterval`

**Type:** `number | false` (milliseconds)

Poll at a fixed interval. Set to `false` or omit to disable polling.

### `refetchOnWindowFocus`

**Type:** `boolean`

Re-fetch when the browser tab regains focus. Defaults to `true`.
