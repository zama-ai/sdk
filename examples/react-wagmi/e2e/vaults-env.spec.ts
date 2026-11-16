import { test, expect } from "@playwright/test";

// The vaults are read once when the network table loads, and the server under test runs with
// none, so these tests load the module in this process instead.
const DEPOSIT = "0xF66Fc55060DF981449Fa746e8F58bD003370bE28";
const REDEEM = "0x9f3cF93246cBf333C6BE65fb7277724eC0c38543";
const saved = process.env.NEXT_PUBLIC_SEPOLIA_VAULTS;
const modulePath = require.resolve("../src/lib/networks");

function loadNetworks(vaults: string) {
  process.env.NEXT_PUBLIC_SEPOLIA_VAULTS = vaults;
  delete require.cache[modulePath];
  return (require(modulePath) as typeof import("../src/lib/networks")).networks;
}

test.afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_SEPOLIA_VAULTS;
  else process.env.NEXT_PUBLIC_SEPOLIA_VAULTS = saved;
  delete require.cache[modulePath];
});

test.describe("NEXT_PUBLIC_<NETWORK>_VAULTS", () => {
  test("reads one vault per pair, checksummed and on the row's chain", () => {
    // Spaces and a trailing comma are fine; addresses come back checksummed.
    const networks = loadNetworks(` ${DEPOSIT.toLowerCase()} : ${REDEEM} , ${REDEEM}:${DEPOSIT}, `);
    const chainId = networks.sepolia.chain.id;
    expect(networks.sepolia.vaults).toEqual([
      { chainId, depositBatcher: DEPOSIT, redeemBatcher: REDEEM },
      { chainId, depositBatcher: REDEEM, redeemBatcher: DEPOSIT },
    ]);
    expect(networks.mainnet.vaults).toEqual([]);
  });

  test("reads an empty value as no vaults", () => {
    expect(loadNetworks("").sepolia.vaults).toEqual([]);
  });

  test("rejects a malformed pair, naming the variable and the entry", () => {
    expect(() => loadNetworks(DEPOSIT)).toThrow(
      `NEXT_PUBLIC_SEPOLIA_VAULTS: expected depositBatcher:redeemBatcher, got "${DEPOSIT}"`,
    );
    expect(() => loadNetworks(`${DEPOSIT}:${REDEEM}:${DEPOSIT}`)).toThrow(
      /expected depositBatcher:redeemBatcher/,
    );
    expect(() => loadNetworks(`${DEPOSIT}:0xnope`)).toThrow(
      "NEXT_PUBLIC_SEPOLIA_VAULTS is not a valid address: 0xnope",
    );
  });
});
