import { describe, expect, test, vi } from "../test-fixtures";
import { ConfigurationError } from "../errors";

describe("ZamaSDK options: transportKeyPairDerivationSecret", () => {
  test("rejects a secret below the 256-bit entropy floor", ({ createSDK }) => {
    expect(() => createSDK({ transportKeyPairDerivationSecret: "short" })).toThrow(
      /transportKeyPairDerivationSecret must be a string or Uint8Array of at least 32 bytes/,
    );
    expect(() => createSDK({ transportKeyPairDerivationSecret: new Uint8Array(16) })).toThrow(
      /transportKeyPairDerivationSecret must be a string or Uint8Array of at least 32 bytes/,
    );
  });

  test("rejects a secret one byte below the floor (31 bytes)", ({ createSDK }) => {
    expect(() => createSDK({ transportKeyPairDerivationSecret: "a".repeat(31) })).toThrow(
      /transportKeyPairDerivationSecret must be a string or Uint8Array of at least 32 bytes/,
    );
    expect(() => createSDK({ transportKeyPairDerivationSecret: new Uint8Array(31) })).toThrow(
      /transportKeyPairDerivationSecret must be a string or Uint8Array of at least 32 bytes/,
    );
  });

  test("accepts a secret exactly at the 256-bit floor (32 bytes)", ({ createSDK }) => {
    expect(() => createSDK({ transportKeyPairDerivationSecret: "a".repeat(32) })).not.toThrow();
    expect(() => createSDK({ transportKeyPairDerivationSecret: new Uint8Array(32) })).not.toThrow();
  });

  test("rejects a wrong-typed secret with the option-naming guidance, not a generic union error", ({
    createSDK,
  }) => {
    const rejected = [123, null, { secret: "a".repeat(32) }];

    for (const value of rejected) {
      const build = () =>
        createSDK({ transportKeyPairDerivationSecret: value as unknown as string });

      expect(build).toThrow(ConfigurationError);
      expect(build).toThrow(
        /transportKeyPairDerivationSecret must be a string or Uint8Array of at least 32 bytes/,
      );
      expect(build).toThrow(/source it from a CSPRNG or secrets manager/);
    }
  });

  test("rejects a secret passed as undefined, naming the unset env var", ({ createSDK }) => {
    const build = () =>
      createSDK({ transportKeyPairDerivationSecret: process.env.MISSING_SECRET_ENV_VAR });

    expect(build).toThrow(ConfigurationError);
    expect(build).toThrow(/transportKeyPairDerivationSecret was passed as undefined/);
    expect(build).toThrow(/environment variable/);
  });

  test("rejects a secret in a browser-like context (window and document present)", ({
    createSDK,
  }) => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {});

    const build = () => createSDK({ transportKeyPairDerivationSecret: new Uint8Array(32).fill(7) });

    try {
      expect(build).toThrow(ConfigurationError);
      expect(build).toThrow(/headless environments only \(CLI tools, servers, agents\)/);
      expect(build).toThrow(/delegate at-rest security/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("rejects a secret in a Web Worker context (importScripts present)", ({ createSDK }) => {
    vi.stubGlobal("importScripts", () => {});

    const build = () => createSDK({ transportKeyPairDerivationSecret: new Uint8Array(32).fill(7) });

    try {
      expect(build).toThrow(ConfigurationError);
      expect(build).toThrow(/headless environments only \(CLI tools, servers, agents\)/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("rejects a secret when only window is defined, the React Native shape", ({ createSDK }) => {
    vi.stubGlobal("window", {});

    const build = () => createSDK({ transportKeyPairDerivationSecret: new Uint8Array(32).fill(7) });

    try {
      expect(build).toThrow(ConfigurationError);
      expect(build).toThrow(/headless environments only \(CLI tools, servers, agents\)/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("accepts a secret with no browser globals present", ({ createSDK }) => {
    expect(() =>
      createSDK({ transportKeyPairDerivationSecret: new Uint8Array(32).fill(7) }),
    ).not.toThrow();
  });

  test("retains neither the option name nor the secret bytes anywhere reachable from the instance", ({
    createSDK,
  }) => {
    const secret = new Uint8Array(32).fill(7);
    const sdk = createSDK({ transportKeyPairDerivationSecret: secret });

    expect("transportKeyPairDerivationSecret" in sdk).toBe(false);

    const seen = new Set<object>();
    const stack: unknown[] = [sdk];
    while (stack.length > 0) {
      const value = stack.pop();
      expect(value).not.toBe(secret);
      if (typeof value !== "object" || value === null || seen.has(value)) {
        continue;
      }
      seen.add(value);
      for (const key of Object.keys(value)) {
        expect(key).not.toBe("transportKeyPairDerivationSecret");
        stack.push((value as Record<string, unknown>)[key]);
      }
    }
  });
});
