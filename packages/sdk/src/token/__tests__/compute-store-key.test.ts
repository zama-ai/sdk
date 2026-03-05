import { describe, it, expect } from "../../test-fixtures";
import { computeStoreKey } from "../credentials-manager";

describe("computeStoreKey", () => {
  it("returns a 32-char hex hash of address:chainId", async () => {
    const key = await computeStoreKey("0xUser", 31337);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it("normalizes address to lowercase", async () => {
    const a = await computeStoreKey("0xABC", 1);
    const b = await computeStoreKey("0xabc", 1);
    expect(a).toBe(b);
  });

  it("differs for different chainIds", async () => {
    const a = await computeStoreKey("0xuser", 1);
    const b = await computeStoreKey("0xuser", 31337);
    expect(a).not.toBe(b);
  });

  it("matches the key CredentialsManager would derive", async () => {
    const address = "0xuser";
    const chainId = 31337;
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${address.toLowerCase()}:${chainId}`),
    );
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const expected = hex.slice(0, 32);
    expect(await computeStoreKey(address, chainId)).toBe(expected);
  });
});
