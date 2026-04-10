import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["tools/zama-sdk-docs-mcp/server.mjs"], {
  stdio: ["pipe", "pipe", "inherit"],
});

let buffer = Buffer.alloc(0);
const responses = new Map();

function encode(message) {
  const json = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
}

function send(message) {
  child.stdin.write(encode(message));
}

function waitForResponse(id, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      if (responses.has(id)) {
        clearInterval(interval);
        resolve(responses.get(id));
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(interval);
        reject(new Error(`Timed out waiting for MCP response id=${id}`));
      }
    }, 10);
  });
}

child.stdout.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  while (true) {
    const separatorIndex = buffer.indexOf("\r\n\r\n");
    if (separatorIndex === -1) {
      return;
    }

    const headers = buffer.slice(0, separatorIndex).toString("utf8");
    const match = headers.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      throw new Error("Missing Content-Length header in MCP response.");
    }

    const contentLength = Number.parseInt(match[1], 10);
    const bodyStart = separatorIndex + 4;
    const bodyEnd = bodyStart + contentLength;
    if (buffer.length < bodyEnd) {
      return;
    }

    const body = buffer.slice(bodyStart, bodyEnd).toString("utf8");
    const message = JSON.parse(body);
    if (typeof message.id !== "undefined") {
      responses.set(message.id, message);
    }
    buffer = buffer.slice(bodyEnd);
  }
});

async function main() {
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  const init = await waitForResponse(1);
  assert.equal(init.result.serverInfo.name, "zama-sdk-docs-mcp");

  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const tools = await waitForResponse(2);
  assert.ok(Array.isArray(tools.result.tools));
  assert.ok(tools.result.tools.some((tool) => tool.name === "list_pages"));
  assert.ok(tools.result.tools.some((tool) => tool.name === "list_package_readmes"));

  send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "list_examples", arguments: {} },
  });
  const examples = await waitForResponse(3);
  assert.match(examples.result.content[0].text, /react-wagmi/);
  assert.doesNotMatch(examples.result.content[0].text, /react-ledger/);

  send({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "read_page", arguments: { logical_path: "guides/build-with-an-llm" } },
  });
  const page = await waitForResponse(4);
  assert.match(page.result.content[0].text, /Build with an LLM/);

  send({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "list_package_readmes", arguments: {} },
  });
  const readmes = await waitForResponse(5);
  assert.match(readmes.result.content[0].text, /Repository README/);

  send({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "list_pages", arguments: { category: "guides" } },
  });
  const guides = await waitForResponse(6);
  assert.match(guides.result.content[0].text, /guides\/configuration/);
  assert.doesNotMatch(guides.result.content[0].text, /reference\/sdk\/ZamaSDK/);

  send({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: {
      name: "search_docs",
      arguments: { query: "confidential transfer", category: "guides", limit: 2 },
    },
  });
  const search = await waitForResponse(7);
  assert.match(search.result.content[0].text, /results: /);
  assert.match(search.result.content[0].text, /## Match 1/);
  assert.match(search.result.content[0].text, /source_type: official-doc/);

  console.log("MCP test passed.");
}

try {
  await main();
  child.kill();
} catch (error) {
  child.kill();
  throw error;
}
