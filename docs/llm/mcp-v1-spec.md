# Zama SDK Docs MCP V1 Specification

This document defines the V1 Model Context Protocol server for the Zama SDK documentation experience.

All versioned and user-facing content described here must be written in English.

## Purpose

The MCP server provides structured access to official Zama SDK documentation, approved official examples, package READMEs, and API reports. Its goal is to let agents search and read trusted sources without needing direct filesystem knowledge.

## Source Groups

The server exposes four logical source groups:

- `docs`
- `examples`
- `package-readmes`
- `api-reports`

The preferred source order remains:

1. official docs
2. approved official examples
3. API reports

## Capabilities

V1 exposes tools only. It does not need MCP resources in order to satisfy the initial use cases.

The server must support:

- `initialize`
- `tools/list`
- `tools/call`
- `ping`

## Tool Contracts

### `list_pages`

Returns the official documentation pages that are part of the published navigation.

Input:

```json
{
  "category": "guides"
}
```

`category` is optional. When present, it must match a docs category such as `guides`, `tutorials`, `reference-sdk`, `reference-react`, `concepts`, or `introduction`.

Output:

- title
- logical path
- source path
- category
- description

### `read_page`

Reads one official documentation page by its logical path.

Input:

```json
{
  "logical_path": "guides/configuration"
}
```

Output:

- title
- logical path
- source path
- source type
- normalized markdown content

### `search_docs`

Searches across official documentation pages.

Input:

```json
{
  "query": "two-phase polling",
  "limit": 10,
  "category": "concepts"
}
```

`category` is optional. When present, the search is restricted to official doc pages in that category.

Output:

- ranked matches
- result count
- title
- logical path
- source path
- short snippet

### `get_nav_tree`

Returns the docs navigation structure based on `docs/gitbook/src/SUMMARY.md`.

Input:

```json
{}
```

Output:

- ordered navigation entries
- title
- logical path
- depth

### `list_examples`

Returns the approved official examples and their documentation files.

Input:

```json
{}
```

Output:

- example name
- title
- logical path
- source path
- description

### `read_example_doc`

Reads one approved example doc file by logical path.

Input:

```json
{
  "logical_path": "examples/react-wagmi/readme"
}
```

Output:

- title
- logical path
- source path
- source type
- raw markdown content

### `search_examples`

Searches across approved example docs only.

Input:

```json
{
  "query": "RelayerNode",
  "limit": 10
}
```

Output:

- ranked matches
- title
- logical path
- source path
- short snippet

### `list_api_reports`

Lists available API reports.

Input:

```json
{}
```

Output:

- title
- logical path
- source path
- description

### `read_api_report`

Reads one API report by logical path.

Input:

```json
{
  "logical_path": "packages/sdk/etc/sdk.api"
}
```

Output:

- title
- logical path
- source path
- source type
- raw report content

### `list_package_readmes`

Lists the repository and package READMEs included in the LLM corpus.

Input:

```json
{}
```

Output:

- title
- logical path
- source path
- description

### `read_package_readme`

Reads one package README by logical path.

Input:

```json
{
  "logical_path": "packages/sdk/README"
}
```

Output:

- title
- logical path
- source path
- source type
- markdown content

## Response Expectations

Every tool response should be directly readable by an agent and should include explicit source metadata wherever practical.

The server must:

- keep source groups distinct
- avoid returning excluded or generated content
- avoid exposing `node_modules`, `.next`, `build`, or `book`

## Implementation Guidance

The implementation should:

- reuse the generated manifest and corpus helpers where possible
- normalize GitBook markdown for official docs reads
- preserve raw markdown for examples, package READMEs, and API reports unless normalization is needed for clarity
- run as a local stdio MCP server

## V1 Non-Goals

V1 does not need:

- direct source code search in `packages/*/src`
- multi-agent targeting
- Codex-specific skills integration
- remote publishing concerns
