### `onSuccess`

**Type:** `(data: TData, variables: TVariables, context: TContext) => void`

Callback fired when the mutation completes without error. Receives the return data, the variables passed to `mutate`, and any context from `onMutate`.

### `onError`

**Type:** `(error: Error, variables: TVariables, context: TContext | undefined) => void`

Callback fired when the mutation throws. Receives the error, the variables passed to `mutate`, and the context from `onMutate` (if it ran).

### `onSettled`

**Type:** `(data: TData | undefined, error: Error | null, variables: TVariables, context: TContext | undefined) => void`

Callback fired after the mutation finishes, regardless of success or failure. Useful for cleanup like closing modals or resetting form state.

### `onMutate`

**Type:** `(variables: TVariables) => Promise<TContext> | TContext`

Callback fired before the mutation function runs. Return a context value to pass through to `onSuccess`, `onError`, and `onSettled`. Commonly used for optimistic updates.
