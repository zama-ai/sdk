import { describe, it, expect, vi } from "../test-fixtures";
import { ChainMismatchError } from "../errors";
import { ReadonlyToken } from "../token/readonly-token";
import type { ZamaSDK } from "../zama-sdk";
import type { Address } from "viem";

type Op = (sdk: ZamaSDK, tokenAddress: Address) => Promise<unknown>;

const HANDLE = ("0x" + "ab".repeat(32)) as Address;
const OTHER_USER = "0x3F3f3f3F3F3f3F3f3F3f3f3F3F3f3F3f3f3f3f3F" as Address;
const RECIPIENT = "0x000000000000000000000000000000000000dEaD" as Address;

// One row per public operation that awaits `sdk.getAccount()` (the chain
// alignment + wallet readiness pre-flight) before any network or signing side-effect.
const MISMATCHED_OPS: ReadonlyArray<readonly [string, Op]> = [
  ["shield", (sdk, t) => sdk.createToken(t).shield(1000n)],
  ["userDecrypt", (sdk, t) => sdk.userDecrypt([{ handle: HANDLE, contractAddress: t }])],
  ["allow", (sdk, t) => sdk.allow([t])],
  ["allowAs", (sdk, t) => sdk.allowAs(OTHER_USER, [t])],
  [
    "decryptBalanceAs",
    (sdk, t) => sdk.createReadonlyToken(t).decryptBalanceAs({ delegatorAddress: OTHER_USER }),
  ],
  [
    "batchBalancesOf",
    (sdk, t) => ReadonlyToken.batchBalancesOf([sdk.createReadonlyToken(t)], OTHER_USER),
  ],
  [
    "confidentialTransfer",
    (sdk, t) =>
      sdk.createToken(t).confidentialTransfer(RECIPIENT, 100n, { skipBalanceCheck: true }),
  ],
  ["unwrap", (sdk, t) => sdk.createToken(t).unwrap(100n)],
  [
    "delegateDecryption",
    (sdk, t) => sdk.createToken(t).delegateDecryption({ delegateAddress: OTHER_USER }),
  ],
] as const;

describe("getAccount (chain alignment)", () => {
  it("returns the wallet account when signer and provider chains match", async ({
    sdk,
    signer,
    provider,
  }) => {
    const walletAccount = {
      address: signer.walletAccount.getSnapshot()!.address,
      chainId: 11155111,
    };
    vi.mocked(signer.walletAccount.getSnapshot).mockReturnValue(walletAccount);
    vi.mocked(signer.requireWalletAccount).mockReturnValue(walletAccount);
    vi.mocked(provider.getChainId).mockResolvedValue(11155111);

    await expect(sdk.getAccount()).resolves.toEqual(walletAccount);
  });

  // `it.for` (not `it.each`) is the API that forwards the fixture context as
  // the second argument; `it.each` only splats the row.
  it.for(MISMATCHED_OPS)(
    "%s throws ChainMismatchError before any side-effect",
    async ([, run], { sdk, signer, provider, relayer, tokenAddress }) => {
      const walletAccount = {
        address: signer.walletAccount.getSnapshot()!.address,
        chainId: 1,
      };
      vi.mocked(signer.walletAccount.getSnapshot).mockReturnValue(walletAccount);
      vi.mocked(signer.requireWalletAccount).mockReturnValue(walletAccount);
      vi.mocked(provider.getChainId).mockResolvedValue(11155111);

      const result = run(sdk, tokenAddress);

      await expect(result).rejects.toMatchObject({
        signerChainId: 1,
        providerChainId: 11155111,
      });
      await expect(result).rejects.toThrow(ChainMismatchError);

      // No write or relayer-mutation side-effects — chain check must run first.
      expect(signer.signTypedData).not.toHaveBeenCalled();
      expect(signer.writeContract).not.toHaveBeenCalled();
      expect(relayer.encrypt).not.toHaveBeenCalled();
    },
  );
});
