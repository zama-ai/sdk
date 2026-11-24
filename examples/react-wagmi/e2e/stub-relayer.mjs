// The Sepolia relayer of the e2e server. It answers `/v2/keyurl` only, so the page CSP lists a
// known key storage origin (see security.spec.ts). Every other route returns 404.
import { createServer } from "node:http";

const STUB_KEY_ORIGIN = "https://keys.stub-relayer.test";

createServer((request, response) => {
  if (request.url !== "/v2/keyurl") {
    response.writeHead(404).end();
    return;
  }
  response
    .writeHead(200, { "content-type": "application/json" })
    .end(
      JSON.stringify({
        response: {
          fheKeyInfo: [{ fhePublicKey: { urls: [`${STUB_KEY_ORIGIN}/PublicKey/1`] } }],
          crs: { 2048: { urls: [`${STUB_KEY_ORIGIN}/CRS/1`] } },
        },
      }),
    );
}).listen(Number(process.argv[2]), "127.0.0.1");
