# Tutorials & How-to Guides

Tutorials and how-to guides are both practical, but they serve fundamentally different readers. Tutorials teach someone who is _learning_. How-to guides help someone who is _working_. Never conflate them.

## Two Distinct Types of Practical Documentation

|                 | **Tutorial** (Learning)                | **How-to Guide** (Working)                    |
| --------------- | -------------------------------------- | --------------------------------------------- |
| **Reader**      | Beginner building mental model         | Competent user solving a problem              |
| **Goal**        | Reader acquires skills & confidence    | Reader accomplishes a specific task           |
| **Voice**       | "we" — building alongside the reader   | "you" — directing an able practitioner        |
| **Scope**       | Complete journey, no shortcuts         | Focused on one task, start-to-finish          |
| **Explanation** | Minimal — link out, don't teach inline | Zero — action only                            |
| **Options**     | Eliminate — one path, no detours       | Acknowledge — real-world complexity           |
| **Examples**    | Getting Started, First App             | Authentication, Data Fetching, Error Handling |

## Other Guide Types

| Type            | Purpose                                                                                       | Example                             |
| --------------- | --------------------------------------------------------------------------------------------- | ----------------------------------- |
| Concept Guide   | Explain an integration pattern (→ see [Explanation Pages](tone.md#explanation-concept-pages)) | TanStack Query, Error Handling, SSR |
| Migration Guide | Upgrade between major versions                                                                | v1 → v2 breaking changes            |
| FAQ             | Address common questions                                                                      | Q&A format with short answers       |

---

## Tutorials (Learning-Oriented)

Tutorials include Getting Started pages and any "First X" walkthrough. The reader is learning — they don't yet know what questions to ask.

### Tutorial-Specific Rules

1. **Show the destination early.** Tell the reader what they'll have built by the end. Screenshot or interactive demo before step 1.
2. **Deliver visible results at every step.** Each step produces output the reader can verify: "You should see..." / "The output looks like..."
3. **Eliminate options.** One path. Don't mention alternatives — they fracture the learner's focus. Save "you could also..." for how-to guides.
4. **Minimize explanation.** If a concept needs > 2 sentences of explanation, link to a concept page instead. The tutorial is for _doing_, not _understanding_.
5. **Guide observation.** Point out what the reader should notice: "Notice that the hook returns `undefined` until the query resolves."
6. **Ensure repeatability.** Pin versions, provide exact config, test the tutorial end-to-end. A tutorial that doesn't work destroys trust.

### Getting Started Structure

Show the destination first — screenshot, demo, or description of what the reader will have built by the end.

Offer two paths:

### Path 1: Automatic (fastest start)

CLI scaffolding command — one line to a working project.

### Path 2: Manual (full control)

4 steps, always in this order:

1. **Install packages** — with inline one-line dependency descriptions
2. **Create config** — central configuration object
3. **Wrap in provider** — framework integration (skip for vanilla)
4. **Use the SDK** — first working code

### End with "Next Steps"

Curate 3-4 links with bolded titles and one-line descriptions:

```markdown
- [**TypeScript**](/react/typescript) Learn how to get the most out of type inference.
- [**Authentication**](/react/guides/authentication) Set up user authentication.
```

---

## How-to Guides (Task-Oriented)

How-to guides serve competent users who know what they want to accomplish. The reader is _working_, not _learning_.

### How-to Guide Rules

1. **Assume competence.** The reader already knows the SDK basics. Don't re-explain setup or foundational concepts — link to the tutorial.
2. **Action only.** Every sentence either tells the reader to do something or shows them code. No teaching, no theory, no background.
3. **Name the task in the title.** "Authenticate Users", "Fetch Data", "Handle Errors" — not "Auth Guide" or "Data Overview".
4. **Address real-world complexity.** Unlike tutorials (which eliminate options), how-to guides should acknowledge variations: "If you're using a custom transport, pass it via..."
5. **Start and end at meaningful points.** Don't repeat setup from Getting Started. Begin where the reader's real problem begins.

### Task Guide Template

```
# [Task Title]

[1-2 sentence description. Name the hooks/functions used. Reference prerequisite guide.]

## Example
[Interactive playground embed — show the FINISHED result FIRST]

## Steps

### 1. [Prerequisite reference]
### 2. Create component skeleton
### 3. Add form/logic handler
### 4. Integrate SDK hook
### 5. Add loading state (optional)
### 6. Handle errors (optional)
### 7. Wire it up!
```

### Rules

1. **Example first.** Show the interactive playground before the walkthrough. Readers see the end result before committing.
2. **One concept per step.** A step adds a hook OR error handling OR loading state — never multiple.
3. **Label optional steps.** Mark enhancement steps with `(optional)` in the heading. Core path should be 3-4 steps.
4. **Full files at every step.** Every code block is a complete, runnable file. Use code groups to show all related files.
5. **Diff-based evolution.** Use `[!code ++]` / `[!code --]` to show what changed. Don't explain changes in prose when diffs are clear.
6. **Chain guides via references**, not repetition. Step 1 should link to the prerequisite guide, not re-explain setup.

## Progressive Disclosure

Layer information from simple to advanced:

| Level                 | Content                          | Audience     |
| --------------------- | -------------------------------- | ------------ |
| Core path (steps 1-4) | Minimal working example          | Beginners    |
| Optional steps (5-7)  | Loading, errors, receipts        | Intermediate |
| Collapsible details   | TypeScript tips, advanced config | Power users  |
| Concept guides        | Integration patterns, caching    | Advanced     |

### Techniques

- **Expandable/details blocks** for advanced TypeScript configuration (see your framework's collapsible syntax)
- **Separate concept guide pages** for deep integration patterns (e.g., TanStack Query internals)
- **FAQ** as a safety net for edge cases
- **"Read from Contract" pattern**: each section is self-contained — reader can stop after section 1 with a working example

## Framework-Specific Content

### Separate pages, not tabs

Maintain parallel page trees per framework. Do NOT use tabs within a page for framework variants.

- Identical structure (same steps, same headings)
- Framework-idiomatic code (React hooks vs Vue composables vs Solid primitives)
- Shared conceptual content via includes

### Package manager tabs ARE tabs

The one exception: install commands always show pnpm/npm/yarn/bun in a code group.

## Prerequisites Communication

### Inline, not in a separate section

Explain dependencies at point-of-use with one-line descriptions:

```markdown
- [Axios](https://axios-http.com) is an HTTP client for the browser and Node.js.
- [TanStack Query](https://tanstack.com/query/v5) is an async state manager.
- [TypeScript](/react/typescript) is optional, but highly recommended.
```

### Guide chaining

Reference prerequisite guides inline rather than listing prerequisites at the top:

```markdown
The following guide builds on the [Authentication guide](/react/guides/authentication)
and uses the [useSubmit](/react/api/hooks/useSubmit) hook.
```

### Warnings for critical requirements

Use a **warning admonition** for configuration that will break things if missing (see [GitBook](references/gitbook.md) for exact syntax):

> **Warning**
> Replace the `projectId` with your own Project ID!
> [Get your Project ID](https://dashboard.example.com/)

## Code Example Progression

### Multi-file code groups at every step

Show all relevant files together in a **multi-tab code group** (see your framework's tab/code-group syntax):

- `send-transaction.tsx` — main component
- `config.ts` — SDK config

### Final step shows ALL files

The "Wire it up!" step includes every file in the code group, giving the reader the complete picture.

### Diff annotations show evolution

```tsx
import { useSendTransaction } from 'wagmi' // [!code ++]
import { parseEther } from 'viem' // [!code ++]

export function SendTransaction() {
  const { data: hash, sendTransaction } = useSendTransaction() // [!code ++]
```

## Migration Guides

### Structure

```markdown
# Migrate from vX to vY

## Overview

[1-2 paragraphs: WHY the major change exists]

[Install command]

> **Info:** Not ready to migrate yet?
> The vX docs are still available at [X.x.sdk.sh](url).

## Breaking Changes

### [Change name]

[Before/After code with [!code --] and [!code ++]]

## Deprecations

### [Deprecated API]

[Replacement code + rationale]
```

### Rules

1. **Always provide an escape hatch.** Link to previous version's docs.
2. **Explain the "why" for every removal.** "This gives you more control" or "Reduces bundle size."
3. **Show before/after as diffs.** Use `[!code --]` / `[!code ++]` for every API change.
4. **Group by impact.** Breaking changes first, then deprecations.

## Error Handling Pattern in Guides

Error handling is always an optional step using a consistent pattern:

1. Import the base error type
2. Destructure `error` from the hook
3. Display with type narrowing: `(error as BaseError).shortMessage || error.message`

Dedicated error handling guides show TypeScript type discrimination for specific error types.

## FAQ Pattern

Use H2 headings as questions. Each answer is 2-5 sentences or a short code snippet. End with a redirect to community discussions for anything not covered.

```markdown
## Type inference doesn't work

[Checklist of 3 things to verify]

## My widget doesn't connect

[Guidance to try alternatives]
```
