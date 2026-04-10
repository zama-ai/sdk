import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCorpusManifest,
  loadGitbookSource,
  normalizeGitbookMarkdown,
  parseSummary,
  repoRoot,
} from "../../scripts/llm/lib/corpus.mjs";

const manifest = buildCorpusManifest();

function readContent(entry) {
  if (entry.source_type === "official-doc") {
    return normalizeGitbookMarkdown(entry.source_path, loadGitbookSource(entry.source_path));
  }
  return readFileSync(join(repoRoot, entry.source_path), "utf8").trim();
}

function findEntry(logicalPath, sourceType) {
  return manifest.entries.find(
    (entry) =>
      entry.logical_path === logicalPath && (!sourceType || entry.source_type === sourceType),
  );
}

function textResponse(text) {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

function renderMetadata(entry) {
  return [
    `title: ${entry.title}`,
    `source_type: ${entry.source_type}`,
    `source_path: ${entry.source_path}`,
    `logical_path: ${entry.logical_path}`,
  ].join("\n");
}

function renderList(entries, fields) {
  return entries
    .map((entry) => fields.map((field) => `${field}: ${entry[field] ?? ""}`).join("\n"))
    .join("\n\n");
}

function renderSearchResults(results) {
  if (results.length === 0) {
    return "results: 0";
  }

  return [
    `results: ${results.length}`,
    "",
    ...results.map(({ entry, score, snippet }, index) =>
      [
        `## Match ${index + 1}`,
        renderMetadata(entry),
        `score: ${score}`,
        `snippet: ${snippet}`,
      ].join("\n"),
    ),
  ].join("\n\n");
}

function buildSnippet(content, query) {
  const normalized = content.replace(/\s+/g, " ");
  const index = normalized.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return normalized.slice(0, 220).trim();
  const start = Math.max(0, index - 80);
  const end = Math.min(normalized.length, index + 140);
  return normalized.slice(start, end).trim();
}

function searchEntries(entries, query, limit = 10) {
  const ranked = [];
  for (const entry of entries) {
    const content = readContent(entry);
    const haystack = `${entry.title}\n${entry.description}\n${content}`;
    const lowerHaystack = haystack.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const count = lowerHaystack.split(lowerQuery).length - 1;
    if (count <= 0) continue;
    ranked.push({
      entry,
      score: count,
      snippet: buildSnippet(content, query),
    });
  }

  return ranked
    .sort(
      (left, right) =>
        right.score - left.score || left.entry.logical_path.localeCompare(right.entry.logical_path),
    )
    .slice(0, limit);
}

function filterDocsByCategory(entries, category) {
  if (!category) {
    return entries;
  }
  return entries.filter((entry) => entry.category === category);
}

const tools = [
  {
    name: "list_pages",
    description: "List official Zama SDK documentation pages from the published navigation.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "read_page",
    description: "Read one official Zama SDK documentation page by logical path.",
    inputSchema: {
      type: "object",
      properties: {
        logical_path: { type: "string" },
      },
      required: ["logical_path"],
      additionalProperties: false,
    },
  },
  {
    name: "search_docs",
    description: "Search official Zama SDK documentation pages.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
        category: { type: "string" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_nav_tree",
    description: "Return the official docs navigation tree based on SUMMARY.md.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "list_examples",
    description: "List approved official example docs for the Zama SDK.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "read_example_doc",
    description: "Read one approved official example doc by logical path.",
    inputSchema: {
      type: "object",
      properties: {
        logical_path: { type: "string" },
      },
      required: ["logical_path"],
      additionalProperties: false,
    },
  },
  {
    name: "search_examples",
    description: "Search approved official example docs.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "list_api_reports",
    description: "List available SDK API reports.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "read_api_report",
    description: "Read one SDK API report by logical path.",
    inputSchema: {
      type: "object",
      properties: {
        logical_path: { type: "string" },
      },
      required: ["logical_path"],
      additionalProperties: false,
    },
  },
  {
    name: "list_package_readmes",
    description: "List repository and package READMEs included in the Zama SDK LLM corpus.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "read_package_readme",
    description: "Read one repository or package README by logical path.",
    inputSchema: {
      type: "object",
      properties: {
        logical_path: { type: "string" },
      },
      required: ["logical_path"],
      additionalProperties: false,
    },
  },
];

function handleToolCall(name, args = {}) {
  const docs = manifest.entries.filter((entry) => entry.source_type === "official-doc");
  const examples = manifest.entries.filter((entry) => entry.source_type === "official-example");
  const readmes = manifest.entries.filter((entry) => entry.source_type === "package-readme");
  const apiReports = manifest.entries.filter((entry) => entry.source_type === "api-report");

  switch (name) {
    case "list_pages":
      return textResponse(
        renderList(filterDocsByCategory(docs, args.category), [
          "title",
          "logical_path",
          "source_path",
          "category",
          "description",
        ]),
      );
    case "read_page": {
      const entry = findEntry(args.logical_path, "official-doc");
      if (!entry) throw new Error(`Unknown official doc logical_path: ${args.logical_path}`);
      return textResponse(`${renderMetadata(entry)}\n\n${readContent(entry)}`);
    }
    case "search_docs": {
      const results = searchEntries(
        filterDocsByCategory(docs, args.category),
        args.query,
        args.limit ?? 10,
      );
      return textResponse(renderSearchResults(results));
    }
    case "get_nav_tree":
      return textResponse(
        parseSummary()
          .map(
            (entry) =>
              `depth: ${entry.depth}\ntitle: ${entry.title}\nlogical_path: ${entry.logicalPath}`,
          )
          .join("\n\n"),
      );
    case "list_examples":
      return textResponse(
        renderList(examples, ["title", "logical_path", "source_path", "description"]),
      );
    case "read_example_doc": {
      const entry = findEntry(args.logical_path, "official-example");
      if (!entry) throw new Error(`Unknown official example logical_path: ${args.logical_path}`);
      return textResponse(`${renderMetadata(entry)}\n\n${readContent(entry)}`);
    }
    case "search_examples": {
      const results = searchEntries(examples, args.query, args.limit ?? 10);
      return textResponse(renderSearchResults(results));
    }
    case "list_api_reports":
      return textResponse(
        renderList(apiReports, ["title", "logical_path", "source_path", "description"]),
      );
    case "read_api_report": {
      const entry = findEntry(args.logical_path, "api-report");
      if (!entry) throw new Error(`Unknown API report logical_path: ${args.logical_path}`);
      return textResponse(`${renderMetadata(entry)}\n\n${readContent(entry)}`);
    }
    case "list_package_readmes":
      return textResponse(
        renderList(readmes, ["title", "logical_path", "source_path", "description"]),
      );
    case "read_package_readme": {
      const entry = findEntry(args.logical_path, "package-readme");
      if (!entry) {
        throw new Error(`Unknown package README logical_path: ${args.logical_path}`);
      }
      return textResponse(`${renderMetadata(entry)}\n\n${readContent(entry)}`);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function encodeMessage(message) {
  const json = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
}

function send(message) {
  process.stdout.write(encodeMessage(message));
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  send({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  });
}

function handleRequest(message) {
  const { id, method, params } = message;
  try {
    switch (method) {
      case "initialize":
        sendResult(id, {
          protocolVersion: "2024-11-05",
          serverInfo: {
            name: "zama-sdk-docs-mcp",
            version: "0.1.0",
          },
          capabilities: {
            tools: {},
          },
        });
        return;
      case "notifications/initialized":
        return;
      case "ping":
        sendResult(id, {});
        return;
      case "tools/list":
        sendResult(id, { tools });
        return;
      case "tools/call":
        sendResult(id, handleToolCall(params.name, params.arguments ?? {}));
        return;
      default:
        sendError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    sendError(id, -32000, error instanceof Error ? error.message : String(error));
  }
}

let buffer = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  while (true) {
    const separatorIndex = buffer.indexOf("\r\n\r\n");
    if (separatorIndex === -1) return;

    const headerText = buffer.slice(0, separatorIndex).toString("utf8");
    const contentLengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
    if (!contentLengthMatch) {
      buffer = Buffer.alloc(0);
      return;
    }

    const contentLength = Number.parseInt(contentLengthMatch[1], 10);
    const messageStart = separatorIndex + 4;
    const messageEnd = messageStart + contentLength;
    if (buffer.length < messageEnd) return;

    const rawMessage = buffer.slice(messageStart, messageEnd).toString("utf8");
    buffer = buffer.slice(messageEnd);
    handleRequest(JSON.parse(rawMessage));
  }
});
