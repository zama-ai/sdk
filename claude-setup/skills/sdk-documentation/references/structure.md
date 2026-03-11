# Documentation Structure

Rules for organizing an SDK documentation site.

## Site Architecture

Organize docs into parallel tracks per framework/variant, each mirroring the same structure:

```
docs/
  framework-a/          # e.g. react/
    getting-started.md
    guides/             # Task-oriented how-to guides
    api/                # API reference pages
      hooks/            # (or functions/, composables/, classes/, etc.)
      config/
      plugins/          # (or adapters/, connectors/, providers/, etc.)
  framework-b/          # e.g. vue/ — mirrors framework-a structure
  core/                 # Framework-agnostic version
  shared/               # Reusable content fragments (never rendered directly)
  snippets/             # Reusable code files for embedding
```

### Key principles

1. **Mirror structure across variants.** Every framework track uses identical directory layout and sidebar ordering. Readers switching frameworks find docs in the same place.
2. **Shared content lives in `shared/`.** Write once, include everywhere. Shared files are excluded from search and navigation — they only appear via includes.
3. **Snippets are real code files.** Store reusable config, schema, and boilerplate files in `snippets/` — embed them in docs via file inclusion rather than duplicating.

## Sidebar / Navigation

Order sidebar sections by the reader's journey:

1. **Introduction** — Why, Installation, Getting Started, TypeScript
2. **Guides** — Task-oriented (e.g. Authentication, Data Fetching, Error Handling)
3. **Configuration** — Config creation, storage, providers
4. **API Reference** — Hooks/functions alphabetically, grouped by domain if > 30 items
5. **Miscellaneous** — Errors, Utilities, FAQ

Use `collapsed: true` on sub-groups with > 5 items to keep the sidebar manageable.

## Frontmatter

Keep frontmatter minimal:

```yaml
---
title: useBalance
description: Hook for fetching native currency balance.
---
```

Only `title` and `description`. No tags, categories, or sidebar metadata — let the sidebar config handle navigation.

## Page Templates

Every page type follows a rigid template. Predictability is a feature.

### API Reference Page (Query/Read)

```
# hookName
One-sentence description.

## Import
## Usage
## Parameters
  ### paramA
  ### paramB
  ---  (horizontal rule separates core from optional params)
  ### optionalParamC
## Return Type
## Underlying API  (link to lower-level library or core function)
```

### API Reference Page (Mutation/Write)

Same as query but includes mutation-specific shared content (onSuccess, onError, mutate, mutateAsync).

### Guide Page

```
# Task Title
1-2 sentence description + hook/function references.

## Example  (interactive playground embed FIRST)

## Steps
### 1. Prerequisite reference
### 2. Create skeleton
### 3. Add logic
### 4. Integrate SDK hook
### 5. Add loading state (optional)
### 6. Handle errors (optional)
### 7. Wire it up!
```

### Getting Started Page

```
# Getting Started

## Overview  (one sentence + link to "Why")

## Automatic Installation  (CLI scaffolding)
## Manual Installation
### Step 1: Install
### Step 2: Configure
### Step 3: Wrap in Provider
### Step 4: Use

## Next Steps  (3-4 curated links with descriptions)
```

## Content Reuse System

Use markdown includes with template variables to eliminate duplication across framework tracks.

### Pattern: Shared content with variable interpolation

**Wrapper page** (per framework):

```md
<script setup>
const packageName = 'my-sdk'
const actionName = 'getData'
const typeName = 'GetData'
</script>

<!--@include: @shared/getBalance.md-->
```

**Shared content** (in `shared/`):

````md
## Import

```ts-vue
import { {{actionName}} } from '{{packageName}}'
```
````

This approach enables writing content once while generating correct framework-specific imports, types, and links.

### Pattern: Shared option/result blocks

Extract common parameter groups (e.g., TanStack Query options, mutation results) into dedicated shared files. Include them in every page that uses those patterns.

## Cross-Referencing

1. **Within same section**: relative markdown links `[createConfig](/react/api/createConfig)`
2. **Cross-section**: full paths `[writeContract](/core/api/actions/writeContract)`
3. **External**: full URLs `[TanStack Query docs](https://tanstack.com/query/v5/docs/...)`
4. **Same-page anchors**: `[enabled](#enabled)`, `[abi](#abi)`
5. **Deprecation links**: Badge + migration guide link `<Badge type="warning">[deprecated](/react/guides/migrate-v2-to-v3#change)</Badge>`

## Code Example Conventions

| Convention                          | Usage                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Code groups                         | Always show companion files (config, schema/types) alongside main example |
| `// [!code focus]`                  | Highlight the relevant line in per-parameter examples                     |
| `// [!code ++]` / `// [!code --]`   | Show additions/removals in migration and step-by-step guides              |
| File inclusion `<<< @/snippets/...` | Embed reusable config/schema files rather than duplicating                |
| `twoslash` blocks                   | Demonstrate TypeScript type inference with hover annotations              |
| Package manager tabs                | Always show pnpm, npm, yarn, bun for install commands                     |
