# Zama SDK Docs MCP

Local MCP server for the Zama SDK documentation corpus.

## Run

```bash
node tools/zama-sdk-docs-mcp/server.mjs
```

## Scope

This server exposes four trusted source groups:

- official docs
- approved official examples
- package READMEs
- API reports

It intentionally excludes generated output, `node_modules`, `.next`, and unapproved examples.

## Notes

- `list_pages` and `search_docs` support an optional `category` filter for narrowing official doc results.
- Search tools return ranked matches with explicit source metadata and snippets.

## Test

```bash
node tools/zama-sdk-docs-mcp/test.mjs
```
