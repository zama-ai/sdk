// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

/**
 * @title CleartextArithmetic
 * @notice Pure arithmetic helpers used by cleartext execution mocks to mirror FHE bit-width semantics.
 */
library CleartextArithmetic {
    /**
     * @notice Clamps a value to the provided bit width using a low-bit mask.
     * @param value Value to clamp.
     * @param bitWidth Number of low bits to keep. Values >= 256 leave the value unchanged.
     * @return The masked value constrained to `bitWidth`.
     */
    function clamp(uint256 value, uint256 bitWidth) internal pure returns (uint256) {
        if (bitWidth >= 256) {
            return value;
        }

        return value & ((uint256(1) << bitWidth) - 1);
    }

    function add(uint256 a, uint256 b, uint256 bitWidth) internal pure returns (uint256) {
        unchecked {
            return clamp(a + b, bitWidth);
        }
    }

    /**
     * @notice Subtracts `b` from `a` using wrap-around semantics at the provided bit width.
     * @param a Minuend value.
     * @param b Subtrahend value.
     * @param bitWidth Bit width of the simulated ciphertext type.
     * @return Wrapped subtraction result constrained to `bitWidth`.
     */
    function sub(uint256 a, uint256 b, uint256 bitWidth) internal pure returns (uint256) {
        unchecked {
            if (bitWidth >= 256) {
                return a - b;
            }
            return clamp(a - b + (uint256(1) << bitWidth), bitWidth);
        }
    }

    function mul(uint256 a, uint256 b, uint256 bitWidth) internal pure returns (uint256) {
        unchecked {
            return clamp(a * b, bitWidth);
        }
    }

    function bitAnd(uint256 a, uint256 b, uint256 bitWidth) internal pure returns (uint256) {
        return clamp(a & b, bitWidth);
    }

    function bitOr(uint256 a, uint256 b, uint256 bitWidth) internal pure returns (uint256) {
        return clamp(a | b, bitWidth);
    }

    function bitXor(uint256 a, uint256 b, uint256 bitWidth) internal pure returns (uint256) {
        return clamp(a ^ b, bitWidth);
    }

    function shl(uint256 a, uint256 b, uint256 bitWidth) internal pure returns (uint256) {
        return clamp(a << (b % bitWidth), bitWidth);
    }

    function shr(uint256 a, uint256 b, uint256 bitWidth) internal pure returns (uint256) {
        return clamp(a >> (b % bitWidth), bitWidth);
    }

    function rotl(uint256 a, uint256 b, uint256 bitWidth) internal pure returns (uint256) {
        uint256 shift = b % bitWidth;
        if (shift == 0) {
            return a;
        }
        return clamp((a << shift) | (a >> (bitWidth - shift)), bitWidth);
    }

    function rotr(uint256 a, uint256 b, uint256 bitWidth) internal pure returns (uint256) {
        uint256 shift = b % bitWidth;
        if (shift == 0) {
            return a;
        }
        return clamp((a >> shift) | (a << (bitWidth - shift)), bitWidth);
    }

    function neg(uint256 value, uint256 bitWidth) internal pure returns (uint256) {
        unchecked {
            return clamp(~value + 1, bitWidth);
        }
    }

    function bitNot(uint256 value, uint256 bitWidth) internal pure returns (uint256) {
        if (bitWidth >= 256) {
            return ~value;
        }
        uint256 mask = (uint256(1) << bitWidth) - 1;
        return ~value & mask;
    }

    function rand(bytes16 seed, uint256 bitWidth) internal pure returns (uint256) {
        uint256 randomValue = uint256(keccak256(abi.encodePacked(seed, "randValue")));
        return clamp(randomValue, bitWidth);
    }

    function randBounded(bytes16 seed, uint256 upperBound) internal pure returns (uint256) {
        uint256 randomValue = uint256(keccak256(abi.encodePacked(seed, "randBoundedValue")));
        return randomValue % upperBound;
    }
}
