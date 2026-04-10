# `llms.txt` and `llms-full.txt` Format Specification

This document defines the V1 format requirements for the Zama SDK LLM-facing artifacts.

All versioned and user-facing content described here must be written in English.

## Goals

The two files serve different purposes:

- `llms.txt` is a lightweight discovery index
- `llms-full.txt` is the complete agent-readable documentation bundle

Both files must reflect the official source hierarchy defined in `docs/llm/agent-content-scope.md`.

## Source Types

Every entry in the corpus must be assigned one of these `source_type` values:

- `official-doc`
- `official-example`
- `package-readme`
- `api-report`

Only the first three types may appear in `llms.txt` or `llms-full.txt`.

## `llms.txt` Requirements

### Structure

`llms.txt` must use a compact, scan-friendly structure:

1. file heading
2. short project description
3. short source-of-truth note
4. grouped index sections

### Required Sections

- `Official Documentation`
- `Official Examples`
- `Package READMEs`

### Entry Format

Each entry must contain:

- a title
- a logical path or repo-relative source path
- a short description

Recommended shape:

```md
- [Title](logical/path): Short description.
```

### Ordering Rules

- Official documentation entries must follow the navigation order defined in `docs/gitbook/src/SUMMARY.md`
- Examples must be grouped after official documentation
- Package READMEs must be grouped after examples

## `llms-full.txt` Requirements

### Structure

`llms-full.txt` must be strongly structured, but still plain text / markdown friendly for agents.

Required top-level sections:

1. project heading
2. short project description
3. source-of-truth note
4. `Official Documentation`
5. `Official Examples`
6. `Package READMEs`

### Per-Entry Header

Every included content block must begin with explicit metadata:

```md
## <Title>

- source_type: official-doc
- source_path: docs/gitbook/src/...
- logical_path: guides/...
```

### Content Rules

- Keep the original prose whenever possible
- Strip build-only frontmatter metadata that is not useful to the agent
- Preserve headings, code fences, and meaningful notes
- Preserve relative meaning even when syntax is transformed

## GitBook Transformation Rules

Source pages use GitBook syntax and must be normalized before inclusion.

### Frontmatter

- Strip YAML frontmatter blocks

### Includes

- Resolve `{% include "..." %}` recursively
- Inline the referenced markdown content

### Hints

- Convert `{% hint style="..." %}` blocks into readable markdown callouts

Recommended output:

```md
> [!INFO]
> Hint body...
```

Supported labels:

- `info`
- `warning`
- `danger`
- `success`

If an unsupported style appears, render it as `NOTE`.

### Tabs

- Convert GitBook tab groups into sequential markdown subsections
- Preserve the tab title as a subsection heading

Recommended output:

```md
### Tab: React

...content...

### Tab: Node.js

...content...
```

### Links

- Preserve source-relative meaning
- Convert internal docs links to repo-relative or logical links that remain understandable in a flat text context

## Manifest Metadata

The corpus manifest must capture at least:

- `id`
- `title`
- `source_path`
- `source_type`
- `category`
- `logical_path`
- `description`
- `include_in_llms_txt`
- `include_in_llms_full`

## English-Only Rule

All generated descriptions, grouping labels, metadata labels, notes, and headings must be written in English.

## Validation Expectations

The build and validation flow must confirm:

- every official doc page referenced by `SUMMARY.md` is represented
- every approved example doc is represented
- excluded examples do not appear
- source types are valid
- `api-report` entries are excluded from `llms.txt` and `llms-full.txt`
