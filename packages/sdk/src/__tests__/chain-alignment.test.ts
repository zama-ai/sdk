import { describe, test, expect, vi } from "../test-fixtures";
import { ChainMismatchError } from "../errors";
import { Token } from "../token/token";
import type { ZamaSDK } from "../zama-sdk";
import type { Address } from "viem";

type Op = (sdk: ZamaSDK, tokenAddress: Address) => Promise<unknown>;

const HANDLE = ("0x" + "ab".repeat(32)) as Address;
const OTHER_USER = "0x3F3f3f3F3F3f3F3f3F3f3f3F3F3f3F3f3f3f3f3F" as Address;
const RECIPIENT = "0x000000000000000000000000000000000000dEaD" as Address;

// One row per public operation that calls `requireChainAlignment` before any
// network or signing side-effect. Each entry is `[operation-name, run]` where
// `operation-name` matches the string passed to `requireChainAlignment` inside
// the SUT and is asserted on the thrown error.
const MISMATCHED_OPS: ReadonlyArray<readonly [string, Op]> = [
  ["shield", (sdk, t) => sdk.createWrappedToken(t).shield(1000n)],
  [
    "decryptValuesFromPairs",
    (sdk, t) =>
      sdk.decryption.decryptValuesFromPairs([{ encryptedValue: HANDLE, contractAddress: t }]),
  ],
  ["grantPermit", (sdk, t) => sdk.permits.grantPermit([t])],
  ["grantDelegationPermit", (sdk, t) => sdk.permits.grantDelegationPermit(OTHER_USER, [t])],
  [
    "decryptBalanceAs",
    (sdk, t) => sdk.createToken(t).decryptBalanceAs({ delegatorAddress: OTHER_USER }),
  ],
  ["batchBalancesOf", (sdk, t) => Token.batchBalancesOf([sdk.createToken(t)], OTHER_USER)],
  [
    "confidentialTransfer",
    (sdk, t) =>
      sdk.createToken(t).confidentialTransfer(RECIPIENT, 100n, { skipBalanceCheck: true }),
  ],
  ["unwrap", (sdk, t) => sdk.createWrappedToken(t).unwrap(100n)],
  [
    "delegateDecryption",
    (sdk, t) =>
      sdk.delegations.delegateDecryption({ contractAddress: t, delegateAddress: OTHER_USER }),
  ],
  [
    "revokeDelegation",
    (sdk, t) =>
      sdk.delegations.revokeDelegation({ contractAddress: t, delegateAddress: OTHER_USER }),
  ],
] as const;

describe("chain alignment guards", () => {
  // `test.for` (not `test.each`) is the API that forwards the fixture context
  // as the second argument; `test.each` only splats the row.
  test.for(MISMATCHED_OPS)(
    "%s throws ChainMismatchError before any side-effect",
    async ([operation, run], { sdk, signer, provider, relayer, tokenAddress }) => {
      const walletAccount = {
        address: signer.walletAccount.getSnapshot()!.address,
        chainId: 1,
      };
      vi.mocked(signer.walletAccount.getSnapshot).mockReturnValue(walletAccount);
      vi.mocked(signer.requireWalletAccount).mockReturnValue(walletAccount);
      vi.mocked(provider.getChainId).mockResolvedValue(11155111);

      const result = run(sdk, tokenAddress);

      await expect(result).rejects.toMatchObject({
        operation,
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
