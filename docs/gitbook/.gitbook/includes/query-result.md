### `data`

**Type:** `TData | undefined`

The last successfully resolved data for the query.

### `error`

**Type:** `Error | null`

The error object if the query failed, otherwise `null`.

### `isLoading`

**Type:** `boolean`

`true` on the first fetch when there is no cached data. Equivalent to `isPending && isFetching`.

### `isPending`

**Type:** `boolean`

`true` when there is no cached data and no query attempt has finished yet.

### `isSuccess`

**Type:** `boolean`

`true` when the query has received a successful response.

### `isError`

**Type:** `boolean`

`true` when the query encountered an error.

### `isFetching`

**Type:** `boolean`

`true` whenever the query is fetching, including background re-fetches. Use this for subtle loading indicators that do not replace content.

### `refetch`

**Type:** `() => Promise<QueryObserverResult>`

Manually trigger a re-fetch. Returns a promise that resolves with the query result.

### `status`

**Type:** `"pending" | "error" | "success"`

The current status of the query. Prefer the boolean flags above for conditional rendering.
