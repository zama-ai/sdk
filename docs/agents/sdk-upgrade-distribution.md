# SDK-upgrade: external distribution

How the upgrade capability reaches partner apps (e.g. Ambire) that are **not** in this repo. The principle: partners **apply** committed guides; they never **generate** them. Regeneration stays SDK-side so every consumer converges on the same reviewed artifact.

## What ships, and where

External Claude Code skills live in the separate [`zama-ai/skills`](https://github.com/zama-ai/skills) marketplace, not in this repo's `claude-setup/` (which is dev-only, for contributing to the SDK itself). The upgrade capability is published there as a **self-contained skill bundle**:

```
sdk-upgrade-apply-guide/
  SKILL.md                       # the portable apply-guide skill
  guides/
    <A>__<B>.json + .md          # every committed migration guide
    index.json                   # catalogue: { from, to, file, changes, required } + generatedAt
```

No SDK-repo CLI travels with it. The skill carries the version-selection rule and gating instructions as prose; the guides and their index travel alongside.

## Maintainer: cut a release of the bundle

```sh
pnpm sdk-upgrade dist            # assembles dist/sdk-upgrade/sdk-upgrade-apply-guide/ (gitignored)
```

`dist` copies the apply-guide `SKILL.md` plus every `migrations/<A>__<B>.{json,md}`, and regenerates `guides/index.json`. Copy that directory into the `zama-ai/skills` marketplace and release it there. Re-run whenever a new guide is committed under `migrations/`.

## Partner: install and upgrade

Install the skill (via the marketplace or `npx skills add`), then in the partner app ask Claude to upgrade to a target SDK version. With the skill active, Claude:

1. Reads the app's installed `@zama-fhe/*` version from `package.json`.
2. **Selects the guide** from `guides/index.json` (rule below).
3. Applies it — only the listed changes, idempotently, never re-deriving deltas.
4. Gates with the **app's own** formatter + typecheck/build (no SDK CLI). Green typecheck is the bar.

## Version-selection rule

Among guides whose `to` equals the target **B**, pick the one whose `from` is the **nearest published version ≤ the app's installed version**. A guide with an older `from` floor still applies — it is idempotent on a newer app (the same `selectGuide` logic the in-repo CLI uses, `scripts/sdk-upgrade/lib/guide-schema.mjs`).

**Fallback — no guide qualifies** (the app predates every floor, or no committed guide targets B): the partner cannot self-serve. They request the couple SDK-side; a maintainer generates and commits `migrations/<A>__<B>` (Half 1), re-runs `pnpm sdk-upgrade dist`, and releases the updated bundle. Partners never generate guides themselves — that is the property that keeps consumers convergent.
