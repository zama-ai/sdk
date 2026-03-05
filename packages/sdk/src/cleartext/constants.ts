export enum FheType {
  Bool = 0,
  Uint4 = 1,
  Uint8 = 2,
  Uint16 = 3,
  Uint32 = 4,
  Uint64 = 5,
  Uint128 = 6,
  Uint160 = 7,
  Uint256 = 8,
}

export const FHE_BIT_WIDTHS: Record<FheType, number> = {
  [FheType.Bool]: 1,
  [FheType.Uint4]: 4,
  [FheType.Uint8]: 8,
  [FheType.Uint16]: 16,
  [FheType.Uint32]: 32,
  [FheType.Uint64]: 64,
  [FheType.Uint128]: 128,
  [FheType.Uint160]: 160,
  [FheType.Uint256]: 256,
};

/**
 * Maps encryption bit-width to the on-chain FHE type identifier.
 * Derived from FHE_BIT_WIDTHS, with Bool mapped to 2 (encryption width).
 *
 * | bits | type      | id |
 * |------|-----------|----|
 * |    2 | ebool     |  0 |
 * |    4 | euint4    |  1 |
 * |    8 | euint8    |  2 |
 * |   16 | euint16   |  3 |
 * |   32 | euint32   |  4 |
 * |   64 | euint64   |  5 |
 * |  128 | euint128  |  6 |
 * |  160 | eaddress  |  7 |
 * |  256 | euint256  |  8 |
 */
export const BITS_TO_FHE_TYPE: Record<number, number> = Object.fromEntries(
  Object.entries(FHE_BIT_WIDTHS).map(([type, bits]) => [bits, Number(type)]),
);
BITS_TO_FHE_TYPE[2] = FheType.Bool; // encryption width for bool is 2, not 1

export const HANDLE_VERSION = 0;

export const PREHANDLE_MASK = 0xffffffffffffffffffffffffffffffffffffffffff0000000000000000000000n;

export const GATEWAY_CHAIN_ID = 10_901;

/** Byte length of a mock public key (matches production KMS public-key size). */
export const KEYPAIR_PUBLIC_KEY_BYTES = 800;

/** Byte length of a mock private key (matches production KMS private-key size). */
export const KEYPAIR_PRIVATE_KEY_BYTES = 1632;

/** Byte length of mock public key / public params payloads. */
export const MOCK_KEY_BYTES = 32;
