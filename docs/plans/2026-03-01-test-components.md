# Shared Test Components Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract the 12 duplicated UI components from test-vite and test-nextjs into a shared `@zama-fhe/test-components` package.

**Architecture:** Create a new private workspace package that exports TSX source files directly (no build step). Both Vite and Turbopack consume TSX natively. The only component requiring modification is `token-table.tsx` which needs a `LinkComponent` prop instead of a framework-specific `Link` import.

**Tech Stack:** React 19, TypeScript, pnpm workspaces

---

### Task 1: Create the test-components package scaffold

**Files:**

- Create: `packages/test-components/package.json`
- Create: `packages/test-components/tsconfig.json`
- Create: `packages/test-components/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@zama-fhe/test-components",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "peerDependencies": {
    "react": ">=18",
    "@zama-fhe/react-sdk": "workspace:*",
    "viem": ">=2",
    "wagmi": ">=2"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "target": "es2022",
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules"]
}
```

**Step 3: Create barrel export (empty for now)**

```ts
// src/index.ts — will be populated as components are moved
```

**Step 4: Run pnpm install to register workspace package**

Run: `pnpm install`
Expected: Success, new package recognized in workspace

**Step 5: Commit**

```bash
git add packages/test-components/
git commit -m "feat(test-components): scaffold shared test components package"
```

---

### Task 2: Move the 11 unchanged components

These components are identical between test-vite and test-nextjs (minus `"use client"`). Copy them from test-vite as-is.

**Files:**

- Copy from `packages/test-vite/src/components/` to `packages/test-components/src/`:
  - `approve-form.tsx`
  - `authorize-all-panel.tsx`
  - `connect-wallet.tsx`
  - `fhe-relayer-panel.tsx`
  - `shield-form.tsx`
  - `transfer-form.tsx`
  - `transfer-from-form.tsx`
  - `unshield-form.tsx`
  - `unshield-all-form.tsx`
  - `unwrap-manual-form.tsx`
  - `wrapper-discovery-panel.tsx`
- Modify: `packages/test-components/src/index.ts`

**Step 1: Copy all 11 component files**

Copy each file from `packages/test-vite/src/components/` to `packages/test-components/src/`. No modifications needed — they have no `"use client"` directive and no framework-specific imports.

**Step 2: Update barrel export**

```ts
// src/index.ts
export { ApproveForm } from "./approve-form";
export { AuthorizeAllPanel } from "./authorize-all-panel";
export { ConnectWallet } from "./connect-wallet";
export { FheRelayerPanel } from "./fhe-relayer-panel";
export { ShieldForm } from "./shield-form";
export { TransferForm } from "./transfer-form";
export { TransferFromForm } from "./transfer-from-form";
export { UnshieldForm } from "./unshield-form";
export { UnshieldAllForm } from "./unshield-all-form";
export { UnwrapManualForm } from "./unwrap-manual-form";
export { WrapperDiscoveryPanel } from "./wrapper-discovery-panel";
```

**Step 3: Verify TypeScript compiles**

Run: `cd packages/test-components && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/test-components/src/
git commit -m "feat(test-components): add 11 shared form/panel components"
```

---

### Task 3: Move and modify token-table.tsx

`token-table.tsx` imports `Link` from `react-router`. Replace that with a `LinkComponent` prop.

**Files:**

- Create: `packages/test-components/src/token-table.tsx`
- Modify: `packages/test-components/src/index.ts`

**Step 1: Create modified token-table.tsx**

Copy `packages/test-vite/src/components/token-table.tsx` to `packages/test-components/src/token-table.tsx` and modify:

1. Remove: `import { Link } from "react-router";`
2. Add a `LinkComponent` prop type and thread it through

The `TokenTable` component signature changes to:

```tsx
export function TokenTable({
  tokenAddresses,
  erc20Tokens = [],
  LinkComponent,
}: {
  tokenAddresses: Address[];
  erc20Tokens?: { address: Address; wrapper: Address }[];
  LinkComponent: React.ComponentType<{ to: string; className?: string; children: React.ReactNode }>;
});
```

Pass `LinkComponent` down to `TokenRow` and `ERC20TokenRow` as a prop, and replace `<Link ...>` with `<LinkComponent ...>` in both sub-components.

**Step 2: Add to barrel export**

Add to `src/index.ts`:

```ts
export { TokenTable } from "./token-table";
```

**Step 3: Verify TypeScript compiles**

Run: `cd packages/test-components && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/test-components/src/token-table.tsx packages/test-components/src/index.ts
git commit -m "feat(test-components): add token-table with framework-agnostic LinkComponent prop"
```

---

### Task 4: Update test-vite to use shared components

**Files:**

- Modify: `packages/test-vite/package.json` — add `@zama-fhe/test-components: workspace:*` dependency
- Delete: all 12 files in `packages/test-vite/src/components/` (approve-form, authorize-all-panel, connect-wallet, fhe-relayer-panel, shield-form, token-table, transfer-form, transfer-from-form, unshield-form, unshield-all-form, unwrap-manual-form, wrapper-discovery-panel)
- Modify: `packages/test-vite/src/App.tsx` — update ConnectWallet import
- Modify: all 11 page files in `packages/test-vite/src/pages/` — update imports from `../components/X` to `@zama-fhe/test-components`
- Modify: `packages/test-vite/src/pages/wallet.tsx` — pass `LinkComponent` prop to `TokenTable`

**Step 1: Add workspace dependency**

In `packages/test-vite/package.json`, add to `dependencies`:

```json
"@zama-fhe/test-components": "workspace:*"
```

Run: `pnpm install`

**Step 2: Update all page imports**

For each page file in `packages/test-vite/src/pages/`, change:

```ts
import { ShieldForm } from "../components/shield-form";
```

to:

```ts
import { ShieldForm } from "@zama-fhe/test-components";
```

Do this for all 11 pages: shield, unshield, unshield-all, transfer, transfer-from, approve, authorize-all, fhe-relayer, unwrap-manual, wrapper-discovery.

For `wallet.tsx`, also pass the `Link` from react-router as `LinkComponent`:

```tsx
import { Link } from "react-router";
import { TokenTable } from "@zama-fhe/test-components";
// ...
<TokenTable
  tokenAddresses={CONFIDENTIAL_TOKEN_ADDRESSES}
  erc20Tokens={ERC20_TOKENS}
  LinkComponent={Link}
/>;
```

Note: react-router's `Link` uses `to` prop which matches our `LinkComponent` type.

**Step 3: Update App.tsx**

Change:

```ts
import { ConnectWallet } from "./components/connect-wallet";
```

to:

```ts
import { ConnectWallet } from "@zama-fhe/test-components";
```

**Step 4: Delete local component files**

Delete all 12 files from `packages/test-vite/src/components/`.

**Step 5: Verify build**

Run: `cd packages/test-vite && pnpm build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add packages/test-vite/
git commit -m "refactor(test-vite): use shared test-components package"
```

---

### Task 5: Update test-nextjs to use shared components

**Files:**

- Modify: `packages/test-nextjs/package.json` — add `@zama-fhe/test-components: workspace:*` dependency
- Delete: all 12 files in `packages/test-nextjs/src/components/`
- Modify: all page files in `packages/test-nextjs/src/app/*/page.tsx` — update imports
- Modify: `packages/test-nextjs/src/app/layout.tsx` — update ConnectWallet import
- Modify: `packages/test-nextjs/src/app/wallet/page.tsx` — pass `LinkComponent`
- Modify: `packages/test-nextjs/next.config.ts` — may need `transpilePackages` for TSX

**Step 1: Add workspace dependency**

In `packages/test-nextjs/package.json`, add to `dependencies`:

```json
"@zama-fhe/test-components": "workspace:*"
```

Run: `pnpm install`

**Step 2: Update all page imports**

For each page in `packages/test-nextjs/src/app/*/page.tsx`, change:

```ts
import { ShieldForm } from "@/components/shield-form";
```

to:

```ts
import { ShieldForm } from "@zama-fhe/test-components";
```

For `wallet/page.tsx`, also pass Next.js `Link` as `LinkComponent`. Since Next.js `Link` uses `href` not `to`, create a thin adapter:

```tsx
import NextLink from "next/link";
import { TokenTable } from "@zama-fhe/test-components";

function Link({ to, ...props }: { to: string; className?: string; children: React.ReactNode }) {
  return <NextLink href={to} {...props} />;
}

// In JSX:
<TokenTable
  tokenAddresses={CONFIDENTIAL_TOKEN_ADDRESSES}
  erc20Tokens={ERC20_TOKENS}
  LinkComponent={Link}
/>;
```

**Step 3: Update layout.tsx**

Change:

```ts
import { ConnectWallet } from "@/components/connect-wallet";
```

to:

```ts
import { ConnectWallet } from "@zama-fhe/test-components";
```

Note: `layout.tsx` is a server component. Since `ConnectWallet` uses hooks (client-only), Next.js will need this component to be used from a client boundary. The page files already use `"use client"` or the components are imported by client components. Check if Next.js handles this — the shared components don't have `"use client"` but are imported by files that may need it. If layout.tsx import fails, add a local `connect-wallet.tsx` re-export with `"use client"`.

**Step 4: Check Next.js TSX transpilation**

Next.js with Turbopack should handle workspace TSX files. If not, add to `next.config.ts`:

```ts
transpilePackages: ["@zama-fhe/test-components"],
```

**Step 5: Delete local component files**

Delete all 12 files from `packages/test-nextjs/src/components/`.

**Step 6: Verify build**

Run: `cd packages/test-nextjs && pnpm build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add packages/test-nextjs/
git commit -m "refactor(test-nextjs): use shared test-components package"
```

---

### Task 6: Run e2e tests to verify nothing broke

**Files:** None (verification only)

**Step 1: Run Playwright tests against Vite app**

Run: `cd packages/playwright && npx playwright test --project=vite`
Expected: All tests pass

**Step 2: Run Playwright tests against Next.js app**

Run: `cd packages/playwright && npx playwright test --project=nextjs`
Expected: All tests pass

**Step 3: If tests fail, fix issues and commit**

Any failures are likely import path issues or missing `"use client"` directives.
