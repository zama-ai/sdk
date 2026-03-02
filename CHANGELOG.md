# Changelog

## [1.0.0-alpha.5](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.4...v1.0.0-alpha.5) (2026-03-02)

## [1.0.0-alpha.4](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.3...v1.0.0-alpha.4) (2026-03-02)

### Features

- add activity feed, batch transfer, and resume unshield e2e tests ([70efc7e](https://github.com/zama-ai/sdk/commit/70efc7ecd35e3efa08edd4d150559dc93d56aa57))
- add wagmi v2 compatibility shim for useConnection/getConnection ([c480ac4](https://github.com/zama-ai/sdk/commit/c480ac43415b2fb97fb5e5ef50645abc4f959b7b))
- cache decrypted balances in storage to eliminate spinner on reload ([63df398](https://github.com/zama-ai/sdk/commit/63df39897495a0547306070ec6f22cee23746226))
- **test-components:** add 11 shared form/panel components ([71aea3d](https://github.com/zama-ai/sdk/commit/71aea3dad0b61e328f2a4e221b4c58f7f656e63c))
- **test-components:** add shared responsive sidebar nav ([2cbdab0](https://github.com/zama-ai/sdk/commit/2cbdab05c7962068c7965ba4c8ec4368e8bbf074))
- **test-components:** add token-table with framework-agnostic LinkComponent prop ([62a89d0](https://github.com/zama-ai/sdk/commit/62a89d01604b31cb757296e389803aa8797b1acd))
- **test-components:** scaffold shared test components package ([2ed32fa](https://github.com/zama-ai/sdk/commit/2ed32fa4d1a3178786d0da9acd5d01102e7aeab8))
- **test-vite:** add React Router, Tailwind CSS, and extract pages ([e70f4ad](https://github.com/zama-ai/sdk/commit/e70f4ad60e89de429fe3f798897e30a15a737370))
- **test-vite:** migrate to rolldown-vite ([ab80bfc](https://github.com/zama-ai/sdk/commit/ab80bfcd4abf47adff5196686efb14d42cabfd39))

### Bug Fixes

- address integrator friction — gas limits, worker IIFE, CDN localhost, StrictMode restart, Sepolia /v2 ([a42d583](https://github.com/zama-ai/sdk/commit/a42d583ef745ca23af94481a83ff9347156f3df1))
- **ci:** add Vite build step before running e2e tests ([689e1d5](https://github.com/zama-ai/sdk/commit/689e1d565c2471fd26ca7521c67e42d49d930b86))
- **playwright:** drain in-flight route handlers before reverting chain state ([23cfec9](https://github.com/zama-ai/sdk/commit/23cfec996adc70083b21f870260544921e1b4f89))
- **playwright:** use uniform 30s timeout for nextjs project ([bfe96af](https://github.com/zama-ai/sdk/commit/bfe96af56d7b024a8145bc9edec52fc69359aa87))
- replace `< 2M` with prose in JSDoc to silence tsdoc-malformed-html-name ([cf4264e](https://github.com/zama-ai/sdk/commit/cf4264e35c4b6ad4a8af1800a0966fac1106b20d))
- **sdk:** add /v2 path to mainnet relayer URL ([0310d01](https://github.com/zama-ai/sdk/commit/0310d01428300f488119dc689c165a2c023e50b8))
- **test-components:** add non-null assertion for array index access ([6b9a1ff](https://github.com/zama-ai/sdk/commit/6b9a1ffe568a8956404ac14b4c182936661517c0))
- **test-nextjs:** correct theme.css import path in globals.css ([f4b8564](https://github.com/zama-ai/sdk/commit/f4b85641766e974f30f590d13c88732f8b380eb0))
- **test-nextjs:** correct USDT contract address to match hardhat deployment ([6cd96f5](https://github.com/zama-ai/sdk/commit/6cd96f5b94486e520740b0d73a64c478d6fe163a))
- **test-nextjs:** replace CONTRACTS.confidentialToken with CONTRACTS.cUSDT ([b0ab373](https://github.com/zama-ai/sdk/commit/b0ab373a30e845729d85329704c00d6cb0211b7c))

### Reverts

- remove premature localhost CDN validation & document balance cache ([2a3664c](https://github.com/zama-ai/sdk/commit/2a3664cf7879b0352cfe4b4e2852b3e14d73e227))

## [1.0.0-alpha.3](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.2...v1.0.0-alpha.3) (2026-02-27)

## [1.0.0-alpha.2](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.1...v1.0.0-alpha.2) (2026-02-27)

## 1.0.0-alpha.1 (2026-02-26)

### Features

- add API key auth and mainnet support to examples ([189f6c1](https://github.com/zama-ai/sdk/commit/189f6c1b06d3dcbe82d38b4575cf0c27b24999fc))
- add CDN URL validation and simplify worker global scope typing ([b1f8362](https://github.com/zama-ai/sdk/commit/b1f8362a770f1628d589722522f55fe7604230d7))
- add CredentialsLocked/Unlocked events ([dd14c06](https://github.com/zama-ai/sdk/commit/dd14c0654bffb33aa8d116d2f65aa33cb58562e1))
- add E2E test app with Playwright tests and CI pipeline ([e0b316f](https://github.com/zama-ai/sdk/commit/e0b316f4f4b2b09a6451230828bf95675446dd36))
- add E2E tests for approve, transfer-from, unshield-all, unwrap, FHE relayer, and wrapper discovery hooks ([a242d7a](https://github.com/zama-ai/sdk/commit/a242d7ac64b3ba14d379df14d0d73271301e0fd0))
- add example projects and make EthersSigner accept BrowserProvider ([2690388](https://github.com/zama-ai/sdk/commit/26903888b8cfca5f32d8ae0c8c71e91a271bc7c3))
- add GenericLogger for worker observability and improve hook docs ([10ddc15](https://github.com/zama-ai/sdk/commit/10ddc15cbdc8f06b7e83b6b506ebbee37c2c1ae3))
- add Hex type, missing hooks, DX improvements, and bug fixes ([9db28b1](https://github.com/zama-ai/sdk/commit/9db28b18bddec8648f3f02fabd692fa03e1d3015))
- add Hex type, wagmi suspense hooks, error tests, and community docs ([3c68206](https://github.com/zama-ai/sdk/commit/3c682064497d1f5bc535fd50bfac617488e741b2))
- add lazy chain ID resolution and auto re-init on chain switch ([0dca351](https://github.com/zama-ai/sdk/commit/0dca351b1168afb1d1cca6f225e7b58ad0b16392))
- add lock/unlock/isUnlocked API for session signature management ([bde2896](https://github.com/zama-ai/sdk/commit/bde289655ae93ae12703f2405e118e4f376efa4d))
- add maxConcurrency option to batch decrypt and event emission tests ([c4cfc29](https://github.com/zama-ai/sdk/commit/c4cfc29552111d158eaf870257b8bdaa22ec7b07))
- add NodeWorkerPool with least-connections scheduling ([2e9ec8c](https://github.com/zama-ai/sdk/commit/2e9ec8c4fca3f76f05965f5516bbd9ff1c8d0f1f))
- add PR coverage reporting and bump thresholds to 80% ([fd8833b](https://github.com/zama-ai/sdk/commit/fd8833b17ff6fc57a3b672ec8dd48ab6819a61a5))
- add Suspense variants for token metadata, approval, allowance, and wrapper discovery hooks ([a93b25c](https://github.com/zama-ai/sdk/commit/a93b25cacdb85dcece3b5d07d7704e724b1ff225))
- add useBalanceOf hook, security config, and fix E2E integrity check ([a072f17](https://github.com/zama-ai/sdk/commit/a072f17e67449919bd04721bb85438c0f4025093))
- improve wallet compatibility, error handling, and SDK robustness ([5dcbe4d](https://github.com/zama-ai/sdk/commit/5dcbe4d154e7fd91b2e7acdcc0a0f1d9a9d4aaf7))
- initialize token-sdk monorepo with source packages ([d5e1180](https://github.com/zama-ai/sdk/commit/d5e1180ed8f52125d7291c2cd8ab0940cd8bc6a1))
- **react-sdk:** add query/mutation options factory exports ([f00e67e](https://github.com/zama-ai/sdk/commit/f00e67e0d6f1bbc11c85e200bf198ffbfc99c5fa))
- SDK API improvements [SDK-4] ([#19](https://github.com/zama-ai/sdk/issues/19)) ([7b77999](https://github.com/zama-ai/sdk/commit/7b77999347fd8ab5683450a245094c022e7a3ee7))
- session-scoped signatures with re-sign flow and legacy migration ([9eeb55e](https://github.com/zama-ai/sdk/commit/9eeb55e31009c3cf8f47af43f8f881c2ba36cc52))
- **token-react-sdk:** add tsup build config and npm exports ([6658c7a](https://github.com/zama-ai/sdk/commit/6658c7a0ab76becf4e8b6d195f499a8ee365735f))
- **token-sdk:** add tsup build config and npm exports ([82e9311](https://github.com/zama-ai/sdk/commit/82e931183efbbfd1564558fe0080b75ace6d1dec))

### Bug Fixes

- CI hardening, worker init dedup, mutation hooks, RelayerNode re-export ([1cfd393](https://github.com/zama-ai/sdk/commit/1cfd393a111efc8a6931e3269f32b39cf62efca8))
- **ci:** disable submodule checkout for vitest workflow to fix Dependabot PRs ([bb049b4](https://github.com/zama-ai/sdk/commit/bb049b45954c4ebfa900dccca1f71ce15238cecf))
- clear() also clears session signature, isExpired works without session ([768bef7](https://github.com/zama-ai/sdk/commit/768bef7b5d2c7b1184778f881caa16ecb0b84fc8))
- correct balanceOf log from "Confidential" to "Decrypted" ([c130a3b](https://github.com/zama-ai/sdk/commit/c130a3bae7e7eab4942571dc3d4df2ccdb9906a8))
- correct README inaccuracies — error class names, peer deps, pnpm version ([5fdebf6](https://github.com/zama-ai/sdk/commit/5fdebf6b05f2a579f8d60f69432051a4f4a23f07))
- **e2e:** increase Hardhat webServer timeout to prevent CI flake ([4ecf80b](https://github.com/zama-ai/sdk/commit/4ecf80b166b5f2802023e0acfa7db80e2f9ed642))
- **e2e:** remove explicit webServer timeouts to use Playwright defaults ([a93b1bd](https://github.com/zama-ai/sdk/commit/a93b1bd1728953aaf345a3c1b1ae19cea16465f7))
- ensure "use client" directive survives bundling with code splitting ([159f0fa](https://github.com/zama-ai/sdk/commit/159f0fa9f8bf6054b7ca22250b86fbf9543761ef))
- move prepare build to root where tsup is available ([5ca49ec](https://github.com/zama-ai/sdk/commit/5ca49ec1b9b80db980288025a676c78354675cb5))
- preserve address case to satisfy relayer SDK checksum validation ([bb13aab](https://github.com/zama-ai/sdk/commit/bb13aab83781807e47adcfc9d0ce42a2d2908e6a))
- production hardening — strict types, security, retry logic, CI pinning ([93f627d](https://github.com/zama-ai/sdk/commit/93f627de6813e810026db70c5153cd9505371af6))
- production hardening — worker leaks, race conditions, error codes ([7fdb749](https://github.com/zama-ai/sdk/commit/7fdb7493a818f9babc0f7d2c5950f26b83b7fba2))
- production readiness — license, source maps, type safety, error handling ([8381634](https://github.com/zama-ai/sdk/commit/83816342b3137922465107298cec021b7b6e9b6c))
- race conditions, worker crash recovery, and query key stability ([5908e6e](https://github.com/zama-ai/sdk/commit/5908e6ea024ebd9842dd0759ff8d8dfb80f6f656))
- race conditions, worker init safety, and defensive hardening ([dc369de](https://github.com/zama-ai/sdk/commit/dc369de8577c8cdaadfd3ef61d1354e3059d3d1e)), closes [#worker](https://github.com/zama-ai/sdk/issues/worker)
- **react-sdk:** invalidate wagmi useBalance cache on unshield/finalize ([7af63b2](https://github.com/zama-ai/sdk/commit/7af63b2d7fafc49fb3c830b2bd978b9ae7102c4d))
- **react-sdk:** replace unsafe casts, fix fee hooks signer access, add test coverage ([6c0a13f](https://github.com/zama-ai/sdk/commit/6c0a13f86730fa2e85e84a8318cf3c8ec298ce22))
- **react-sdk:** use broad balanceOf predicate instead of address-scoped ([6488a7d](https://github.com/zama-ai/sdk/commit/6488a7d0a0cefb832809bf2a6d92ef80ca3a8fb0))
- **react-sdk:** use predicate-based wagmi balanceOf cache invalidation ([5a57077](https://github.com/zama-ai/sdk/commit/5a570772946d05224d7f353bb6ee14e831177ff0))
- relax wagmi peer dependency to >=2 for v2 compatibility ([d89aef8](https://github.com/zama-ai/sdk/commit/d89aef84eeedd9c676f45f49ba43591f2787e569))
- remove Node.js-only RelayerNode re-export from react-sdk ([8fbe902](https://github.com/zama-ai/sdk/commit/8fbe902bf8666a7363c1585b8d802d494b8d5efe))
- Remove remaining token-sdk references ([46b40b8](https://github.com/zama-ai/sdk/commit/46b40b8ab0f9cb56bb8616dc3639e289980d0534))
- replace importScripts with fetch+eval in worker to fix MIME-type errors ([a73c02e](https://github.com/zama-ai/sdk/commit/a73c02e78fc0fc790835c6c2f5250be04c679ad9))
- strip EIP712Domain from signer types and re-key balance Map by original addresses ([0d0b8e4](https://github.com/zama-ai/sdk/commit/0d0b8e439adca2c72980a5525e641bec4990a224))
- type safety, error handling, and query stability improvements ([40cb140](https://github.com/zama-ai/sdk/commit/40cb14033103dbdb290e63d5380a79135dcea19c)), closes [NodeWorkerPool#dispatch](https://github.com/zama-ai/NodeWorkerPool/issues/dispatch)
- unwrap error granularity, cache reuse, and defensive hardening ([ba88c32](https://github.com/zama-ai/sdk/commit/ba88c325108d6c67309d123ee3d9d827c9776c74)), closes [#ensureAllowance](https://github.com/zama-ai/sdk/issues/ensureAllowance)
- use blob URL for worker script loading with extension fallback ([a5e3cc0](https://github.com/zama-ai/sdk/commit/a5e3cc0a0c417bb6922c146db3a0c4e8e7c9362b))
- use SUBMODULE_TOKEN for private submodule checkout in CI ([66cda4a](https://github.com/zama-ai/sdk/commit/66cda4a9d5434379cc346622474628550f258b5a))
- worker crash safety, concurrency guards, and query key consistency ([3259942](https://github.com/zama-ai/sdk/commit/32599426bb6985d9ae392af23bc9dc9291551363))

All notable changes to this project will be documented in this file.
