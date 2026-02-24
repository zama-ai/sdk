# Production-Ready Monorepo Design

## Decisions

- **Build tool**: tsup (ESM-only output + .d.ts declarations)
- **Versioning**: @changesets/cli with linked versioning
- **CI/CD**: GitHub Actions (test on PR, auto-publish via changesets)
- **Publish target**: npm public registry
- **Module format**: ESM only

## Build System

tsup per package. Each sub-path export gets its own entry point.

token-sdk entry points: `index`, `viem/index`, `ethers/index`, `node/index`
react-sdk entry points: `index`, `viem/index`, `ethers/index`, `wagmi/index`

Output to `dist/`. Root `pnpm build` runs builds in dependency order.

## Package.json Exports

Each package uses conditional exports:

```json
"exports": {
  ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
  "./viem": { "types": "./dist/viem/index.d.ts", "import": "./dist/viem/index.js" }
}
```

Remove `"private": true`. Add `license`, `repository`, `description`, `files: ["dist"]`.

## Versioning

@changesets/cli with linked versioning (both packages bump together).
Scripts: `pnpm changeset`, `pnpm changeset version`, `pnpm publish -r`.

## CI/CD

- **ci.yml**: PR trigger — pnpm install, build, typecheck, test
- **release.yml**: main push — changesets/action creates "Version Packages" PR, merge publishes to npm

## Linting

ESLint + Prettier at root. `pnpm lint`, `pnpm format` scripts.

## npm Package Contents

Each package publishes only `dist/` and `README.md` via `files` field.
