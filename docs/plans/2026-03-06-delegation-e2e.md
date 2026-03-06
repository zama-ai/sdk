# Delegation E2E Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add end-to-end Playwright tests proving delegated decryption works through the full stack (UI → React SDK → Token → RelayerSDK → cleartext mock → hardhat).

**Architecture:** Thread `aclAddress` through ZamaProvider → ZamaSDK. Add mock relayer endpoints for delegated decrypt. Build a DelegationPanel component. Write a self-delegation Playwright test that shields, delegates, and decrypts via the delegated path.

**Tech Stack:** React, TypeScript, Playwright, vitest, viem, hardhat, @zama-fhe/sdk, @zama-fhe/react-sdk

---

### Task 1: Thread aclAddress through ZamaProvider

**Files:**

- Modify: `packages/react-sdk/src/provider.tsx`

**Step 1: Add aclAddress prop to ZamaProviderProps and pass to ZamaSDK**

```tsx
// In ZamaProviderProps interface, add after sessionTTL:
  /** ACL contract address (required for delegation operations). */
  aclAddress?: Address;

// In ZamaProvider function signature, add aclAddress to destructuring:
export function ZamaProvider({
  children,
  relayer,
  signer,
  storage,
  sessionStorage,
  keypairTTL,
  sessionTTL,
  aclAddress,
  onEvent,
}: ZamaProviderProps) {

// In the useMemo ZamaSDK constructor, add aclAddress:
  const sdk = useMemo(
    () =>
      new ZamaSDK({
        relayer,
        signer,
        storage,
        sessionStorage,
        keypairTTL,
        sessionTTL,
        aclAddress,
        onEvent: onEventRef.current,
      }),
    [relayer, signer, storage, sessionStorage, keypairTTL, sessionTTL, aclAddress],
  );
```

Also add the Address import at the top:

```tsx
import type {
  GenericSigner,
  GenericStorage,
  RelayerSDK,
  ZamaSDKEventListener,
  Address,
} from "@zama-fhe/sdk";
```

**Step 2: Verify build passes**

Run: `pnpm --filter @zama-fhe/react-sdk build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/react-sdk/src/provider.tsx
git commit -m "feat(react-sdk): add aclAddress prop to ZamaProvider"
```

---

### Task 2: Pass ACL address in test apps

**Files:**

- Modify: `packages/test-nextjs/src/constants.ts`
- Modify: `packages/test-nextjs/src/providers.tsx`
- Modify: `packages/test-vite/src/constants.ts`
- Modify: `packages/test-vite/src/providers.tsx`

**Step 1: Add ACL to constants**

In `packages/test-nextjs/src/constants.ts`, add to the CONTRACTS object:

```ts
  acl: deployments.fhevm.acl as Address,
```

In `packages/test-vite/src/constants.ts`, add a new export:

```ts
import deployments from "../../../hardhat/deployments.json";

// Add at the bottom:
export const ACL_ADDRESS = deployments.fhevm.acl;
```

**Step 2: Pass aclAddress to ZamaProvider in both apps**

In `packages/test-nextjs/src/providers.tsx`:

```tsx
import { CONTRACTS } from "@/constants";

// In the ZamaProvider JSX:
<ZamaProvider relayer={relayer} storage={storage} signer={signer} aclAddress={CONTRACTS.acl}>
```

In `packages/test-vite/src/providers.tsx`:

```tsx
import { ACL_ADDRESS } from "./constants";
import type { Address } from "@zama-fhe/react-sdk";

// In the ZamaProvider JSX:
<ZamaProvider relayer={relayer} storage={storage} signer={signer} aclAddress={ACL_ADDRESS as Address}>
```

**Step 3: Commit**

```bash
git add packages/test-nextjs/src/constants.ts packages/test-nextjs/src/providers.tsx packages/test-vite/src/constants.ts packages/test-vite/src/providers.tsx
git commit -m "feat(test-apps): pass aclAddress to ZamaProvider"
```

---

### Task 3: Add delegated decrypt mock endpoints

**Files:**

- Modify: `packages/playwright/fixtures/fhevm.ts`
- Modify: `packages/playwright/fixtures/relayer-sdk.js`

**Step 1: Add routes to fhevm.ts**

After the existing `publicDecrypt` route block (around line 137), before the CDN route, add:

```ts
await page.route(`${baseURL}/createDelegatedEIP712`, async (route) => {
  const body = route.request().postDataJSON();
  const result = fhevm.createDelegatedUserDecryptEIP712(
    body.publicKey,
    body.contractAddresses,
    body.delegatorAddress,
    body.startTimestamp,
    body.durationDays,
  );
  const serialized = JSON.stringify(result, (_, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: serialized,
  });
});

await page.route(`${baseURL}/delegatedUserDecrypt`, async (route) => {
  const body = route.request().postDataJSON();
  try {
    const handleContractPairs = body.handles.map((handle: string) => ({
      handle,
      contractAddress: body.contractAddress,
    }));
    const result = await fhevm.delegatedUserDecrypt(
      handleContractPairs,
      body.privateKey,
      body.publicKey,
      body.signature,
      body.signedContractAddresses,
      body.delegatorAddress,
      body.delegateAddress,
      body.startTimestamp,
      body.durationDays,
    );

    const serialized: Record<string, string> = {};
    for (const [key, value] of Object.entries(result)) {
      serialized[key] = String(value);
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(serialized),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: message }),
    });
  }
});
```

**Step 2: Add methods to relayer-sdk.js mock instance**

Inside the object returned by `createInstance`, after `publicDecrypt`, add:

```js
      createDelegatedUserDecryptEIP712: function (publicKey, contractAddresses, delegatorAddress, startTimestamp, durationDays) {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${BASE_URL}/createDelegatedEIP712`, false);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(
          JSON.stringify({
            publicKey,
            contractAddresses,
            delegatorAddress,
            startTimestamp,
            durationDays,
          }),
        );
        const result = JSON.parse(xhr.responseText);
        return {
          ...result,
          message: {
            ...result.message,
            startTimestamp: BigInt(result.message.startTimestamp),
            durationDays: BigInt(result.message.durationDays),
          },
        };
      },

      delegatedUserDecrypt: async function (
        handleContractPairs,
        privateKey,
        publicKey,
        signature,
        signedContractAddresses,
        delegatorAddress,
        delegateAddress,
        startTimestamp,
        durationDays,
      ) {
        console.log("[Mock SDK] delegatedUserDecrypt called with", handleContractPairs.length, "handles");
        const handles = handleContractPairs.map((p) => p.handle);
        const contractAddress = handleContractPairs[0]?.contractAddress || "";

        const response = await fetch(`${BASE_URL}/delegatedUserDecrypt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            handles,
            contractAddress,
            signedContractAddresses,
            privateKey,
            publicKey,
            signature,
            delegatorAddress,
            delegateAddress,
            startTimestamp,
            durationDays,
          }),
        });

        const result = await response.json();
        console.log("[Mock SDK] delegatedUserDecrypt result:", result);

        const clearValues = {};
        for (const [key, value] of Object.entries(result)) {
          clearValues[key] = BigInt(value);
        }
        return clearValues;
      },
```

**Step 3: Commit**

```bash
git add packages/playwright/fixtures/fhevm.ts packages/playwright/fixtures/relayer-sdk.js
git commit -m "feat(playwright): add delegated decrypt mock endpoints"
```

---

### Task 4: Create DelegationPanel component

**Files:**

- Create: `packages/test-components/src/delegation-panel.tsx`
- Modify: `packages/test-components/src/index.ts`

**Step 1: Create the DelegationPanel**

```tsx
"use client";

import { useMutation } from "@tanstack/react-query";
import { useToken, useReadonlyToken, useMetadata, type Address } from "@zama-fhe/react-sdk";

export function DelegationPanel({
  tokenAddress,
  defaultDelegate,
  defaultDelegator,
}: {
  tokenAddress: Address;
  defaultDelegate?: Address;
  defaultDelegator?: Address;
}) {
  const { data: metadata } = useMetadata(tokenAddress);
  const token = useToken({ tokenAddress });
  const readonlyToken = useReadonlyToken(tokenAddress);

  const delegate = useMutation({
    mutationFn: async (delegateAddress: Address) => {
      return token.delegateDecryption(delegateAddress);
    },
  });

  const decryptAs = useMutation({
    mutationFn: async (delegator: Address) => {
      return readonlyToken.decryptBalanceAs(delegator);
    },
  });

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-white">Delegation {metadata?.symbol ?? "..."}</h2>

      {/* Section 1: Delegate */}
      <form
        action={(formData) => {
          delegate.mutate(formData.get("delegate") as Address);
        }}
        className="space-y-4"
      >
        <h3 className="text-lg text-white">Delegate Decryption</h3>
        <input
          type="text"
          name="delegate"
          placeholder="Delegate address (0x...)"
          defaultValue={defaultDelegate ?? ""}
          required
          className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
          data-testid="delegate-input"
        />
        <button
          type="submit"
          disabled={delegate.isPending}
          className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
          data-testid="delegate-button"
        >
          {delegate.isPending ? "Delegating..." : "Delegate"}
        </button>

        {delegate.isSuccess && (
          <p className="text-zama-success" data-testid="delegate-success">
            Delegated! Tx: {delegate.data?.txHash}
          </p>
        )}
        {delegate.isError && (
          <p className="text-zama-error" data-testid="delegate-error">
            Error: {delegate.error.message}
          </p>
        )}
      </form>

      {/* Section 2: Decrypt as Delegate */}
      <form
        action={(formData) => {
          decryptAs.mutate(formData.get("delegator") as Address);
        }}
        className="space-y-4"
      >
        <h3 className="text-lg text-white">Decrypt as Delegate</h3>
        <input
          type="text"
          name="delegator"
          placeholder="Delegator address (0x...)"
          defaultValue={defaultDelegator ?? ""}
          required
          className="w-full px-3 py-2 bg-zama-surface border border-zama-border rounded outline-none text-white placeholder:text-zama-gray focus:border-zama-yellow focus:ring-1 focus:ring-zama-yellow"
          data-testid="delegator-input"
        />
        <button
          type="submit"
          disabled={decryptAs.isPending}
          className="px-4 py-2 bg-zama-yellow text-zama-black font-medium rounded hover:bg-zama-yellow-hover disabled:opacity-50 transition-colors"
          data-testid="decrypt-delegate-button"
        >
          {decryptAs.isPending ? "Decrypting..." : "Decrypt as Delegate"}
        </button>

        {decryptAs.isSuccess && (
          <p className="text-zama-success" data-testid="delegated-balance">
            {decryptAs.data.toString()}
          </p>
        )}
        {decryptAs.isError && (
          <p className="text-zama-error" data-testid="decrypt-delegate-error">
            Error: {decryptAs.error.message}
          </p>
        )}
      </form>
    </div>
  );
}
```

**Step 2: Export from index.ts**

Add to `packages/test-components/src/index.ts`:

```ts
export { DelegationPanel } from "./delegation-panel";
```

**Step 3: Commit**

```bash
git add packages/test-components/src/delegation-panel.tsx packages/test-components/src/index.ts
git commit -m "feat(test-components): add DelegationPanel component"
```

---

### Task 5: Add /delegation pages to test apps

**Files:**

- Create: `packages/test-nextjs/src/app/delegation/page.tsx`
- Create: `packages/test-vite/src/pages/delegation.tsx`
- Modify: `packages/test-vite/src/App.tsx`

**Step 1: Create Next.js page**

```tsx
import { DelegationPanel } from "@zama-fhe/test-components";
import type { Address } from "@zama-fhe/react-sdk";
import { CONTRACTS } from "@/constants";

export default async function DelegationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const token = (params.token as Address) ?? CONTRACTS.cUSDT;
  const delegate = params.delegate as Address | undefined;
  const delegator = params.delegator as Address | undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Delegation</h1>
      <DelegationPanel
        tokenAddress={token}
        defaultDelegate={delegate}
        defaultDelegator={delegator}
      />
    </div>
  );
}
```

**Step 2: Create Vite page**

```tsx
import type { Address } from "@zama-fhe/react-sdk";
import { useSearchParams } from "react-router";
import { DelegationPanel } from "@zama-fhe/test-components";
import { DEFAULTS } from "../constants";

export default function DelegationPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") as Address) ?? (DEFAULTS.confidentialToken as Address);
  const delegate = (searchParams.get("delegate") as Address | undefined) ?? undefined;
  const delegator = (searchParams.get("delegator") as Address | undefined) ?? undefined;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Delegation</h1>
      <DelegationPanel
        tokenAddress={token}
        defaultDelegate={delegate}
        defaultDelegator={delegator}
      />
    </div>
  );
}
```

**Step 3: Add route in Vite App.tsx**

In `packages/test-vite/src/App.tsx`, add after the `activity-feed` route:

```tsx
<Route path="delegation" Component={lazy(() => import("./pages/delegation"))} />
```

**Step 4: Commit**

```bash
git add packages/test-nextjs/src/app/delegation/page.tsx packages/test-vite/src/pages/delegation.tsx packages/test-vite/src/App.tsx
git commit -m "feat(test-apps): add /delegation pages"
```

---

### Task 6: Add ACL to Playwright contracts fixture

**Files:**

- Modify: `packages/playwright/fixtures/test.ts`

**Step 1: Add acl to contracts object**

In the `contracts` const (around line 22), add:

```ts
  acl: deployments.fhevm.acl as Address,
```

**Step 2: Commit**

```bash
git add packages/playwright/fixtures/test.ts
git commit -m "feat(playwright): add ACL address to test fixture contracts"
```

---

### Task 7: Write delegation Playwright spec

**Files:**

- Create: `packages/playwright/tests/delegation.spec.ts`

**Step 1: Write the test**

```ts
import { test, expect } from "../fixtures";

const account0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

test("should self-delegate and decrypt balance via delegated path", async ({
  page,
  contracts,
  formatUnits,
  computeFee,
}) => {
  const shieldAmount = 1000n;

  // 1. Shield 1000 USDT
  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill("1000");
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  // 2. Self-delegate (account #0 delegates to itself)
  await page.goto(`/delegation?token=${contracts.cUSDT}&delegate=${account0}`);
  await page.getByTestId("delegate-button").click();
  await expect(page.getByTestId("delegate-success")).toContainText("Tx: 0x");

  // 3. Decrypt as delegate (account #0 decrypts its own balance via delegated path)
  await page.goto(`/delegation?token=${contracts.cUSDT}&delegator=${account0}`);
  await page.getByTestId("decrypt-delegate-button").click();

  const expectedBalance = shieldAmount - computeFee(shieldAmount);
  await expect(page.getByTestId("delegated-balance")).toContainText(expectedBalance.toString());
});
```

**Step 2: Run e2e tests**

Run: `pnpm e2e:test -- --grep delegation`
Expected: Test passes in both nextjs and vite projects

**Step 3: Commit**

```bash
git add packages/playwright/tests/delegation.spec.ts
git commit -m "test(e2e): add delegation decrypt happy-path test"
```

---

### Task 8: Final verification

**Step 1: Run full unit test suite**

Run: `pnpm vitest run`
Expected: All tests pass (832+)

**Step 2: Run full e2e suite (if infrastructure available)**

Run: `pnpm e2e:test`
Expected: All existing tests still pass, delegation test passes

**Step 3: Run lint**

Run: `pnpm lint`
Expected: No new lint errors from our changes
