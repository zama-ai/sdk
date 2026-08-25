import { describe, test, expect } from "../../test-fixtures";
import { checksum } from "../utils";
import { resolvePermit } from "../decrypt-permit";
import { DecryptionFailedError } from "../../errors";
import type { Permission, SerializedTransportKeyPairWithPermissions } from "../types";

const A = checksum("0x1111111111111111111111111111111111111111");
const B = checksum("0x2222222222222222222222222222222222222222");
const UNSEEN = checksum("0x3333333333333333333333333333333333333333");
const USER = checksum("0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B");
const PUBLIC_KEY = `0x${"11".repeat(32)}` as const;
const PRIVATE_KEY = `0x${"22".repeat(32)}` as const;
const SIG = `0x${"a1".repeat(65)}` as const;

function v1Permission(contractAddresses: Permission["contractAddresses"]): Permission {
  return {
    version: 1,
    keypairPublicKey: PUBLIC_KEY,
    contractAddresses,
    startTimestamp: 1_700_000_000,
    durationDays: 30,
    serializedPermit: {
      version: 1,
      eip712: { primaryType: "UserDecryptRequestVerification", domain: {}, types: {}, message: {} },
      signature: SIG,
      signerAddress: USER,
    },
  };
}

/** A V2 permit; `contractAddresses: []` makes it a wildcard permit. */
function v2Permission(contractAddresses: Permission["contractAddresses"]): Permission {
  return {
    version: 2,
    keypairPublicKey: PUBLIC_KEY,
    contractAddresses,
    startTimestamp: 1_700_000_000,
    durationSeconds: 86400,
    serializedPermit: {
      version: 2,
      eip712: { primaryType: "UserDecryptRequestVerification", domain: {}, types: {}, message: {} },
      signature: SIG,
      signerAddress: USER,
    },
  };
}

function credentials(permissions: Permission[]): SerializedTransportKeyPairWithPermissions {
  return { keypair: { publicKey: PUBLIC_KEY, privateKey: PRIVATE_KEY }, permissions };
}

describe("resolvePermit", () => {
  test("resolves the permit listing the contract", () => {
    const creds = credentials([v1Permission([A, B])]);
    const resolved = resolvePermit(creds, A);
    expect(resolved.serializedPermit.signature).toBe(SIG);
  });

  test("throws DecryptionFailedError when no permit covers the contract", () => {
    const creds = credentials([v1Permission([A])]);
    expect(() => resolvePermit(creds, UNSEEN)).toThrow(DecryptionFailedError);
  });

  test("a wildcard V2 permit resolves for any contract, including one never explicitly listed", () => {
    const creds = credentials([v2Permission([])]);
    const resolved = resolvePermit(creds, UNSEEN);
    expect(resolved.serializedPermit.signature).toBe(SIG);
  });

  test("a non-wildcard V2 permit still only resolves for its listed contracts", () => {
    const creds = credentials([v2Permission([A])]);
    expect(() => resolvePermit(creds, UNSEEN)).toThrow(DecryptionFailedError);
    expect(resolvePermit(creds, A).serializedPermit.signature).toBe(SIG);
  });
});
