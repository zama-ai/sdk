### `mutate`

**Type:** `(variables: TVariables) => void`

Trigger the mutation. Does not return a promise. Use `onSuccess` / `onError` callbacks to react to the result.

### `mutateAsync`

**Type:** `(variables: TVariables) => Promise<TData>`

Trigger the mutation and return a promise. Useful when you need to `await` the result in an event handler.

### `isPending`

**Type:** `boolean`

`true` while the mutation is in progress. Use this to show loading indicators.

### `isSuccess`

**Type:** `boolean`

`true` after the mutation completes without error.

### `isError`

**Type:** `boolean`

`true` after the mutation throws an error.

### `error`

**Type:** `Error | null`

The error object if the mutation failed, otherwise `null`.

### `data`

**Type:** `TData | undefined`

The return value from the mutation function after a successful call.

### `reset`

**Type:** `() => void`

Reset the mutation state back to its initial values. Clears `data`, `error`, and status flags.
