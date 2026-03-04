# ISSUE-004: Factory spread order inverted vs wagmi pattern

**Severity**: medium
**Confidence**: 95/100
**Type**: guideline-violation

## Description

TASK_1.md specifies the wagmi pattern: `...options.query` spread FIRST, then factory properties override (queryKey, queryFn, enabled always win). All 14+ factories do the opposite — factory properties first, `...filterQueryOptions(config?.query ?? {})` spread LAST.

## Rule violated

TASK_1.md line 57-58, 78:

> "`...options.query` spread first, then factory properties override (queryKey, queryFn, enabled always win)"

## Evidence (all factories follow this pattern)

```ts
// token-metadata.ts:26-41
return {
  queryKey,                                    // factory FIRST
  queryFn: async (context) => { ... },
  staleTime: Infinity,
  enabled: config?.query?.enabled !== false,
  ...filterQueryOptions(config?.query ?? {}),  // user overrides LAST
};
```

wagmi pattern should be:

```ts
return {
  ...filterQueryOptions(config?.query ?? {}),  // user overrides FIRST
  queryKey,                                    // factory overrides LAST (wins)
  queryFn: async (context) => { ... },
  enabled: ...,
};
```

## Practical impact

`filterQueryOptions` strips `enabled`, `queryKey`, `queryFn`, so the critical properties are safe. But if a user passes `staleTime` in their query options, it currently gets silently ignored (factory's `staleTime: Infinity` comes first, then `filterQueryOptions` strips `staleTime` from the user object). In the wagmi pattern, the user's `staleTime` would pass through but be overridden only by properties the factory explicitly sets.

The current behavior is actually MORE restrictive than wagmi (users can't override anything), but it contradicts the stated pattern.

## Affected files

All query option factories in `packages/sdk/src/query/`.
