/**
 * Mock Relayer Server for E2E testing.
 *
 * Handles the relayer API endpoints that the mock CDN bundle delegates to.
 * Uses viem for cleartext FHE operations against a local anvil chain.
 *
 * Usage: node server.mjs <port>
 */
import { createServer } from "node:http";
import {
  concat,
  createPublicClient,
  encodePacked,
  getAddress,
  http,
  keccak256,
  pad,
  parseAbi,
  toBytes,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { NEXTJS_PORT, VITE_PORT } from "./constants";

// ── Constants (mirrored from SDK cleartext module) ──────────

const MOCK_INPUT_SIGNER_PK = "0x7ec8ada6642fc4ccfb7729bc29c17cf8d21b61abd5642d1db992c0b8672ab901";
const MOCK_KMS_SIGNER_PK = "0x388b7680e4e1afa06efbfd45cdd1fe39f3c6af381df6555a19661f283b97de91";

const HANDLE_VERSION = 0;
const PREHANDLE_MASK = 0xffffffffffffffffffffffffffffffffffffffffff0000000000000000000000n;

const RAW_CT_HASH_DOMAIN_SEPARATOR = toBytes("ZK-w_rct");
const HANDLE_HASH_DOMAIN_SEPARATOR = toBytes("ZK-w_hdl");

const FHE_TYPE_NAME_TO_ID = {
  ebool: 0,
  euint8: 2,
  euint16: 3,
  euint32: 4,
  euint64: 5,
  euint128: 6,
  eaddress: 7,
  euint256: 8,
};

const FHE_TYPE_ID_TO_BITS = {
  0: 2,
  2: 8,
  3: 16,
  4: 32,
  5: 64,
  6: 128,
  7: 160,
  8: 256,
};

const ACL_ABI = parseAbi([
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
  "function isHandleDelegatedForUserDecryption(address delegator, address delegate, address contractAddress, bytes32 handle) view returns (bool)",
]);

const EXECUTOR_ABI = parseAbi(["function plaintexts(bytes32 handle) view returns (uint256)"]);

const inputSigner = privateKeyToAccount(MOCK_INPUT_SIGNER_PK);
const kmsSigner = privateKeyToAccount(MOCK_KMS_SIGNER_PK);

// ── Hardhat executor address ────────────────────────────────
const HARDHAT_EXECUTOR = "0xe3a9105a3a932253A70F126eb1E3b589C643dD24";

// ── Helpers ─────────────────────────────────────────────────

function getClient(networkUrl) {
  return createPublicClient({ transport: http(networkUrl) });
}

function cleartextToBytes(cleartext, fheTypeId) {
  const bits = FHE_TYPE_ID_TO_BITS[fheTypeId];
  const byteLength = Math.ceil(bits / 8);
  return toBytes(pad(toHex(cleartext), { size: byteLength }));
}

function computeMockCiphertext(fheTypeId, cleartext, random32) {
  const clearBytes = cleartextToBytes(cleartext, fheTypeId);
  const inner = keccak256(
    concat([toHex(new Uint8Array([fheTypeId])), toHex(clearBytes), toHex(random32)]),
  );
  return keccak256(concat([toHex(RAW_CT_HASH_DOMAIN_SEPARATOR), inner]));
}

function computeInputHandle(mockCiphertext, index, fheTypeId, aclAddress, chainId) {
  const blobHash = keccak256(concat([toHex(RAW_CT_HASH_DOMAIN_SEPARATOR), mockCiphertext]));
  const handleHash = keccak256(
    encodePacked(
      ["bytes", "bytes32", "uint8", "address", "uint256"],
      [toHex(HANDLE_HASH_DOMAIN_SEPARATOR), blobHash, index, aclAddress, chainId],
    ),
  );

  const chainId64 = chainId & 0xffff_ffff_ffff_ffffn;
  const handle =
    (BigInt(handleHash) & PREHANDLE_MASK) |
    (BigInt(index) << 80n) |
    (chainId64 << 16n) |
    (BigInt(fheTypeId) << 8n) |
    BigInt(HANDLE_VERSION);

  return toHex(handle, { size: 32 });
}

function decodeClearValueType(handle, rawValue) {
  const typeByte = Number((BigInt(handle) >> 8n) & 0xffn);
  if (typeByte === 0) {
    return rawValue !== 0n;
  }
  if (typeByte === 7) {
    return toHex(rawValue, { size: 20 });
  }
  return rawValue;
}

function normalizeValue(entry) {
  const fheTypeId = FHE_TYPE_NAME_TO_ID[entry.type];
  if (fheTypeId === undefined) {
    throw new Error(`Unknown FHE type: ${entry.type}`);
  }

  let value;
  if (entry.type === "ebool") {
    value = entry.value === "true" || entry.value === "1" ? 1n : 0n;
  } else if (entry.type === "eaddress") {
    value = BigInt(getAddress(entry.value));
  } else {
    value = BigInt(entry.value);
  }

  return { fheTypeId, value };
}

// ── JSON body helper with BigInt revival ────────────────────

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

// ── CORS ────────────────────────────────────────────────────

// Only allow credentialed CORS for trusted localhost origins.
const ALLOWED_CORS_ORIGINS = new Set([
  `http://localhost:${NEXTJS_PORT}`,
  `http://127.0.0.1:${NEXTJS_PORT}`,
  `http://localhost:${VITE_PORT}`,
  `http://127.0.0.1:${VITE_PORT}`,
]);

function setCorsHeaders(res) {
  // Reflect the request origin so credentials: "include" works.
  // Never use "*" with Allow-Credentials: true (CORS spec violation).
  const origin = res._corsOrigin;
  if (ALLOWED_CORS_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-csrf-token");
}

function sendJson(res, data, status = 200) {
  setCorsHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
  );
}

function sendError(res, message, status = 500) {
  setCorsHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

// ── Route: POST /encrypt ────────────────────────────────────

async function handleEncrypt(req, res) {
  const body = await parseBody(req);
  const {
    values,
    contractAddress,
    userAddress,
    chainId,
    aclContractAddress,
    gatewayChainId,
    verifyingContractAddressInputVerification,
  } = body;

  const entries = values.map(normalizeValue);
  const normContract = getAddress(contractAddress);
  const normUser = getAddress(userAddress);

  const mockCiphertexts = entries.map(({ fheTypeId, value }) =>
    computeMockCiphertext(fheTypeId, value, crypto.getRandomValues(new Uint8Array(32))),
  );

  const ciphertextBlob = keccak256(mockCiphertexts.length > 0 ? concat(mockCiphertexts) : "0x");

  const handles = entries.map(({ fheTypeId }, index) =>
    computeInputHandle(ciphertextBlob, index, fheTypeId, aclContractAddress, BigInt(chainId)),
  );

  const cleartextParts = entries.map(({ value }) => pad(toHex(value), { size: 32 }));
  const cleartextBytes = cleartextParts.length > 0 ? concat(cleartextParts) : "0x";

  const signature = await inputSigner.signTypedData({
    domain: {
      name: "InputVerification",
      version: "1",
      chainId: Number(gatewayChainId),
      verifyingContract: verifyingContractAddressInputVerification,
    },
    types: {
      CiphertextVerification: [
        { name: "ctHandles", type: "bytes32[]" },
        { name: "userAddress", type: "address" },
        { name: "contractAddress", type: "address" },
        { name: "contractChainId", type: "uint256" },
        { name: "extraData", type: "bytes" },
      ],
    },
    primaryType: "CiphertextVerification",
    message: {
      ctHandles: handles,
      userAddress: normUser,
      contractAddress: normContract,
      contractChainId: BigInt(chainId),
      extraData: cleartextBytes,
    },
  });

  const inputProof = toHex(
    toBytes(
      concat([
        toHex(new Uint8Array([handles.length])),
        toHex(new Uint8Array([1])),
        ...handles,
        signature,
        cleartextBytes,
      ]),
    ),
  );

  sendJson(res, { handles, inputProof });
}

// ── Route: POST /user-decrypt ───────────────────────────────

async function handleUserDecrypt(req, res) {
  const body = await parseBody(req);
  const { handles, network, aclContractAddress, executorAddress } = body;
  const contractAddress = getAddress(handles[0].contractAddress);
  const signerAddress = getAddress(body.signerAddress);
  const executor = executorAddress || HARDHAT_EXECUTOR;

  const client = getClient(network);

  // Check ACL
  for (const { handle } of handles) {
    const [actorAllowed, contractAllowed] = await Promise.all([
      client.readContract({
        address: aclContractAddress,
        abi: ACL_ABI,
        functionName: "persistAllowed",
        args: [handle, signerAddress],
      }),
      client.readContract({
        address: aclContractAddress,
        abi: ACL_ABI,
        functionName: "persistAllowed",
        args: [handle, contractAddress],
      }),
    ]);
    if (!actorAllowed) {
      return sendError(res, `User ${signerAddress} not authorized for handle ${handle}`, 403);
    }
    if (!contractAllowed) {
      return sendError(res, `Contract ${contractAddress} not authorized for handle ${handle}`, 403);
    }
  }

  // Read plaintexts
  const clearValues = {};
  for (const { handle } of handles) {
    const raw = await client.readContract({
      address: executor,
      abi: EXECUTOR_ABI,
      functionName: "plaintexts",
      args: [handle],
    });
    clearValues[handle] = decodeClearValueType(handle, raw);
  }

  sendJson(res, clearValues);
}

// ── Route: POST /public-decrypt ─────────────────────────────

async function handlePublicDecrypt(req, res) {
  const body = await parseBody(req);
  const {
    handles,
    network,
    aclContractAddress,
    verifyingContractAddressDecryption,
    gatewayChainId,
    executorAddress,
  } = body;
  const executor = executorAddress || HARDHAT_EXECUTOR;

  const client = getClient(network);

  // Check ACL
  for (const handle of handles) {
    const allowed = await client.readContract({
      address: aclContractAddress,
      abi: ACL_ABI,
      functionName: "isAllowedForDecryption",
      args: [handle],
    });
    if (!allowed) {
      return sendError(res, `Handle ${handle} not allowed for public decryption`, 403);
    }
  }

  // Read plaintexts
  const orderedValues = [];
  const clearValues = {};
  for (const handle of handles) {
    const raw = await client.readContract({
      address: executor,
      abi: EXECUTOR_ABI,
      functionName: "plaintexts",
      args: [handle],
    });
    orderedValues.push(raw);
    clearValues[handle] = decodeClearValueType(handle, raw);
  }

  const abiEncodedClearValues = concat(orderedValues.map((v) => pad(toHex(v), { size: 32 })));

  const signature = await kmsSigner.signTypedData({
    domain: {
      name: "Decryption",
      version: "1",
      chainId: Number(gatewayChainId),
      verifyingContract: verifyingContractAddressDecryption,
    },
    types: {
      PublicDecryptVerification: [
        { name: "ctHandles", type: "bytes32[]" },
        { name: "decryptedResult", type: "bytes" },
        { name: "extraData", type: "bytes" },
      ],
    },
    primaryType: "PublicDecryptVerification",
    message: {
      ctHandles: handles,
      decryptedResult: abiEncodedClearValues,
      extraData: "0x",
    },
  });

  const decryptionProof = toHex(toBytes(concat([toHex(new Uint8Array([1])), signature])));

  sendJson(res, { clearValues, abiEncodedClearValues, decryptionProof });
}

// ── Route: POST /delegated-user-decrypt ─────────────────────

async function handleDelegatedUserDecrypt(req, res) {
  const body = await parseBody(req);
  const {
    handles,
    network,
    aclContractAddress,
    delegatorAddress,
    delegateAddress,
    executorAddress,
  } = body;
  const contractAddress = getAddress(handles[0].contractAddress);
  const executor = executorAddress || HARDHAT_EXECUTOR;

  const client = getClient(network);

  // Check delegation ACL
  for (const { handle } of handles) {
    const allowed = await client.readContract({
      address: aclContractAddress,
      abi: ACL_ABI,
      functionName: "isHandleDelegatedForUserDecryption",
      args: [getAddress(delegatorAddress), getAddress(delegateAddress), contractAddress, handle],
    });
    if (!allowed) {
      return sendError(res, `Handle ${handle} not delegated for user decryption`, 403);
    }
  }

  // Read plaintexts
  const clearValues = {};
  for (const { handle } of handles) {
    const raw = await client.readContract({
      address: executor,
      abi: EXECUTOR_ABI,
      functionName: "plaintexts",
      args: [handle],
    });
    clearValues[handle] = decodeClearValueType(handle, raw);
  }

  sendJson(res, { clearValues });
}

// ── Route: GET /keyurl ──────────────────────────────────────

function handleKeyurl(_req, res) {
  sendJson(res, {
    fhePublicKey: {
      dataId: "mock-public-key-id",
      urls: [],
    },
    crs: {},
  });
}

// ── Server ──────────────────────────────────────────────────

const PORT = parseInt(process.argv[2] || "4200", 10);

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleRequest(req, res) {
  // Stash the request origin for CORS headers (credentials: "include" requires
  // a specific origin, not "*").
  res._corsOrigin = req.headers.origin || "";
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    if (req.method === "GET" && path === "/keyurl") {
      return handleKeyurl(req, res);
    }
    if (req.method === "POST" && path === "/encrypt") {
      return await handleEncrypt(req, res);
    }
    if (req.method === "POST" && path === "/user-decrypt") {
      return await handleUserDecrypt(req, res);
    }
    if (req.method === "POST" && path === "/public-decrypt") {
      return await handlePublicDecrypt(req, res);
    }
    if (req.method === "POST" && path === "/delegated-user-decrypt") {
      return await handleDelegatedUserDecrypt(req, res);
    }

    res.writeHead(404);
    res.end("Not found");
  } catch (err) {
    console.error("[mock-relayer]", err);
    sendError(res, err.message);
  }
}

const server = createServer((req, res) => {
  void handleRequest(req, res);
});

server.listen(PORT, () => {
  console.log(`Mock relayer server ready on port ${PORT}`);
});
