import { describe, it, expect } from "../../test-fixtures";
import { getAddress, type Address } from "viem";
import { CredentialsManager } from "../credentials-manager";

const ADDRESS_A = getAddress("0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa");
const ADDRESS_B = getAddress("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB");

describe("CredentialsManager.computeStoreKey", () => {
  it("returns a 32-char hex hash of address:chainId", async () => {
    const key = await CredentialsManager.computeStoreKey(ADDRESS_A, 31337);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it("distinguishes different checksum addresses", async () => {
    const a = await CredentialsManager.computeStoreKey(ADDRESS_A, 1);
    const b = await CredentialsManager.computeStoreKey(ADDRESS_B, 1);
    expect(a).not.toBe(b);
  });

  it("differs for different chainIds", async () => {
    const a = await CredentialsManager.computeStoreKey(ADDRESS_A, 1);
    const b = await CredentialsManager.computeStoreKey(ADDRESS_A, 31337);
    expect(a).not.toBe(b);
  });

  it("matches the key CredentialsManager would derive", async () => {
    const address: Address = ADDRESS_A;
    const chainId = 31337;
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${address}:${chainId}`),
    );
    const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const expected = hex.slice(0, 32);
    expect(await CredentialsManager.computeStoreKey(address, chainId)).toBe(expected);
  });
});
