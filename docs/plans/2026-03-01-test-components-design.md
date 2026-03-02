# Shared Test Components Package

## Problem

The 12 UI components in `test-vite` and `test-nextjs` are nearly identical copies. The only differences are:

1. `"use client"` directive in Next.js versions
2. `Link` import in `token-table.tsx` (react-router vs next/link)
3. Minor cosmetic differences (non-null assertion in connect-wallet)

## Solution

Create `packages/test-components` (`@zama-fhe/test-components`, private) containing the 12 shared components.

### Components (no changes)

approve-form, authorize-all-panel, connect-wallet, fhe-relayer-panel, shield-form, transfer-form, transfer-from-form, unshield-form, unshield-all-form, unwrap-manual-form, wrapper-discovery-panel.

### Component with change

`token-table.tsx` accepts a `LinkComponent` prop instead of importing a framework-specific Link.

### Build approach

No build step. Export `.tsx` source files directly via `exports` field. Both Vite and Turbopack consume TSX natively.

### Package structure

```
packages/test-components/
  package.json
  tsconfig.json
  src/
    index.ts          # barrel export
    token-table.tsx   # modified: LinkComponent prop
    shield-form.tsx   # unchanged from test-vite version
    ...               # other 10 components unchanged
```

### Integration

- Both test apps add `@zama-fhe/test-components: workspace:*` as dependency
- Both apps delete their local copies of the 12 components
- Both apps import from `@zama-fhe/test-components`
- Next.js pages already have `"use client"` or use server components that import client components
- TokenTable usage passes the app's Link component as a prop

### Peer dependencies

- `react >= 18`
- `@zama-fhe/react-sdk` (workspace)
- `viem >= 2`
- `wagmi >= 2`
