// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHEVMExecutor} from "./fhevm-host/contracts/FHEVMExecutor.sol";
import {FheType} from "./fhevm-host/contracts/shared/FheType.sol";
import {CleartextArithmetic} from "token-sdk/contracts/CleartextArithmetic.sol";

contract CleartextFHEVMExecutor is FHEVMExecutor {
    /// @dev Handle to cleartext value mapping for local testing.
    mapping(bytes32 => uint256) public plaintexts;

    function fheAdd(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheAdd(lhs, rhs, scalarByte);
        (FheType t, uint256 a, uint256 b) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = CleartextArithmetic.add(a, b, _bitWidthForType(t));
    }

    function fheSub(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheSub(lhs, rhs, scalarByte);
        (FheType t, uint256 a, uint256 b) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = CleartextArithmetic.sub(a, b, _bitWidthForType(t));
    }

    function fheMul(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheMul(lhs, rhs, scalarByte);
        (FheType t, uint256 a, uint256 b) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = CleartextArithmetic.mul(a, b, _bitWidthForType(t));
    }

    function fheDiv(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheDiv(lhs, rhs, scalarByte);
        (, uint256 a,) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = a / uint256(rhs);
    }

    function fheRem(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheRem(lhs, rhs, scalarByte);
        (, uint256 a,) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = a % uint256(rhs);
    }

    function fheBitAnd(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheBitAnd(lhs, rhs, scalarByte);
        (FheType t, uint256 a, uint256 b) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = CleartextArithmetic.bitAnd(a, b, _bitWidthForType(t));
    }

    function fheBitOr(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheBitOr(lhs, rhs, scalarByte);
        (FheType t, uint256 a, uint256 b) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = CleartextArithmetic.bitOr(a, b, _bitWidthForType(t));
    }

    function fheBitXor(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheBitXor(lhs, rhs, scalarByte);
        (FheType t, uint256 a, uint256 b) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = CleartextArithmetic.bitXor(a, b, _bitWidthForType(t));
    }

    function fheShl(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheShl(lhs, rhs, scalarByte);
        (FheType t, uint256 a, uint256 b) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = CleartextArithmetic.shl(a, b, _bitWidthForType(t));
    }

    function fheShr(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheShr(lhs, rhs, scalarByte);
        (FheType t, uint256 a, uint256 b) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = CleartextArithmetic.shr(a, b, _bitWidthForType(t));
    }

    function fheRotl(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheRotl(lhs, rhs, scalarByte);
        (FheType t, uint256 a, uint256 b) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = CleartextArithmetic.rotl(a, b, _bitWidthForType(t));
    }

    function fheRotr(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheRotr(lhs, rhs, scalarByte);
        (FheType t, uint256 a, uint256 b) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = CleartextArithmetic.rotr(a, b, _bitWidthForType(t));
    }

    function fheEq(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheEq(lhs, rhs, scalarByte);
        (, uint256 a, uint256 b) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = (a == b) ? 1 : 0;
    }

    function fheNe(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheNe(lhs, rhs, scalarByte);
        (, uint256 a, uint256 b) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = (a != b) ? 1 : 0;
    }

    function fheGe(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheGe(lhs, rhs, scalarByte);
        (, uint256 a, uint256 b) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = (a >= b) ? 1 : 0;
    }

    function fheGt(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheGt(lhs, rhs, scalarByte);
        (, uint256 a, uint256 b) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = (a > b) ? 1 : 0;
    }

    function fheLe(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheLe(lhs, rhs, scalarByte);
        (, uint256 a, uint256 b) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = (a <= b) ? 1 : 0;
    }

    function fheLt(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheLt(lhs, rhs, scalarByte);
        (, uint256 a, uint256 b) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = (a < b) ? 1 : 0;
    }

    function fheMin(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheMin(lhs, rhs, scalarByte);
        (, uint256 a, uint256 b) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = (a < b) ? a : b;
    }

    function fheMax(bytes32 lhs, bytes32 rhs, bytes1 scalarByte) public override returns (bytes32 result) {
        result = super.fheMax(lhs, rhs, scalarByte);
        (, uint256 a, uint256 b) = _loadBinaryOperands(lhs, rhs, scalarByte);
        plaintexts[result] = (a > b) ? a : b;
    }

    function fheNeg(bytes32 ct) public override returns (bytes32 result) {
        result = super.fheNeg(ct);
        FheType t = _typeOf(ct);
        uint256 value = _clamp(plaintexts[ct], t);
        plaintexts[result] = CleartextArithmetic.neg(value, _bitWidthForType(t));
    }

    function fheNot(bytes32 ct) public override returns (bytes32 result) {
        result = super.fheNot(ct);
        FheType t = _typeOf(ct);
        uint256 value = _clamp(plaintexts[ct], t);
        plaintexts[result] = CleartextArithmetic.bitNot(value, _bitWidthForType(t));
    }

    function fheIfThenElse(bytes32 control, bytes32 ifTrue, bytes32 ifFalse)
        public
        override
        returns (bytes32 result)
    {
        result = super.fheIfThenElse(control, ifTrue, ifFalse);
        plaintexts[result] = (plaintexts[control] == 1) ? plaintexts[ifTrue] : plaintexts[ifFalse];
    }

    function cast(bytes32 ct, FheType toType) public override returns (bytes32 result) {
        result = super.cast(ct, toType);
        plaintexts[result] = _clamp(plaintexts[ct], toType);
    }

    function trivialEncrypt(uint256 pt, FheType toType) public override returns (bytes32 result) {
        result = super.trivialEncrypt(pt, toType);
        plaintexts[result] = pt;
    }

    function verifyInput(bytes32 inputHandle, address userAddress, bytes memory inputProof, FheType inputType)
        public
        override
        returns (bytes32 result)
    {
        result = super.verifyInput(inputHandle, userAddress, inputProof, inputType);

        if (inputProof.length < 2) {
            return result;
        }

        uint8 numHandles = uint8(inputProof[0]);
        uint8 numSigners = uint8(inputProof[1]);
        uint256 cleartextStart = 2 + uint256(numHandles) * 32 + uint256(numSigners) * 65;

        if (inputProof.length < cleartextStart + 32) {
            return result;
        }

        for (uint8 i = 0; i < numHandles; i++) {
            uint256 handleOffset = 2 + uint256(i) * 32;
            bytes32 handleInProof;
            assembly {
                handleInProof := mload(add(add(inputProof, 32), handleOffset))
            }

            if (handleInProof == inputHandle) {
                uint256 cleartextOffset = cleartextStart + uint256(i) * 32;
                if (inputProof.length < cleartextOffset + 32) {
                    break;
                }

                uint256 cleartext;
                assembly {
                    cleartext := mload(add(add(inputProof, 32), cleartextOffset))
                }
                plaintexts[result] = cleartext;
                break;
            }
        }
    }

    function _generateRand(FheType randType, bytes16 seed) internal override returns (bytes32 result) {
        result = super._generateRand(randType, seed);
        plaintexts[result] = CleartextArithmetic.rand(seed, _bitWidthForType(randType));
    }

    function _generateRandBounded(uint256 upperBound, FheType randType, bytes16 seed)
        internal
        override
        returns (bytes32 result)
    {
        result = super._generateRandBounded(upperBound, randType, seed);
        plaintexts[result] = CleartextArithmetic.randBounded(seed, upperBound);
    }

    function _loadBinaryOperands(bytes32 lhs, bytes32 rhs, bytes1 scalarByte)
        internal
        view
        returns (FheType t, uint256 a, uint256 b)
    {
        t = _typeOf(lhs);
        a = _clamp(plaintexts[lhs], t);
        b = (scalarByte == 0x01) ? uint256(rhs) : _clamp(plaintexts[rhs], t);
    }

    function _bitWidthForType(FheType fheType) internal pure returns (uint256) {
        if (fheType == FheType.Bool) return 1;
        if (fheType == FheType.Uint2) return 2;
        if (fheType == FheType.Uint4) return 4;
        if (fheType == FheType.Uint6) return 6;
        if (fheType == FheType.Uint8) return 8;
        if (fheType == FheType.Uint10) return 10;
        if (fheType == FheType.Uint12) return 12;
        if (fheType == FheType.Uint14) return 14;
        if (fheType == FheType.Uint16) return 16;
        if (fheType == FheType.Uint24) return 24;
        if (fheType == FheType.Uint32) return 32;
        if (fheType == FheType.Uint40) return 40;
        if (fheType == FheType.Uint48) return 48;
        if (fheType == FheType.Uint56) return 56;
        if (fheType == FheType.Uint64) return 64;
        if (fheType == FheType.Uint72) return 72;
        if (fheType == FheType.Uint80) return 80;
        if (fheType == FheType.Uint88) return 88;
        if (fheType == FheType.Uint96) return 96;
        if (fheType == FheType.Uint104) return 104;
        if (fheType == FheType.Uint112) return 112;
        if (fheType == FheType.Uint120) return 120;
        if (fheType == FheType.Uint128) return 128;
        if (fheType == FheType.Uint136) return 136;
        if (fheType == FheType.Uint144) return 144;
        if (fheType == FheType.Uint152) return 152;
        if (fheType == FheType.Uint160) return 160;
        if (fheType == FheType.Uint168) return 168;
        if (fheType == FheType.Uint176) return 176;
        if (fheType == FheType.Uint184) return 184;
        if (fheType == FheType.Uint192) return 192;
        if (fheType == FheType.Uint200) return 200;
        if (fheType == FheType.Uint208) return 208;
        if (fheType == FheType.Uint216) return 216;
        if (fheType == FheType.Uint224) return 224;
        if (fheType == FheType.Uint232) return 232;
        if (fheType == FheType.Uint240) return 240;
        if (fheType == FheType.Uint248) return 248;
        if (fheType == FheType.Uint256) return 256;
        if (fheType == FheType.Uint512) return 512;
        if (fheType == FheType.Uint1024) return 1024;
        if (fheType == FheType.Uint2048) return 2048;

        if (fheType == FheType.Int2) return 2;
        if (fheType == FheType.Int4) return 4;
        if (fheType == FheType.Int6) return 6;
        if (fheType == FheType.Int8) return 8;
        if (fheType == FheType.Int10) return 10;
        if (fheType == FheType.Int12) return 12;
        if (fheType == FheType.Int14) return 14;
        if (fheType == FheType.Int16) return 16;
        if (fheType == FheType.Int24) return 24;
        if (fheType == FheType.Int32) return 32;
        if (fheType == FheType.Int40) return 40;
        if (fheType == FheType.Int48) return 48;
        if (fheType == FheType.Int56) return 56;
        if (fheType == FheType.Int64) return 64;
        if (fheType == FheType.Int72) return 72;
        if (fheType == FheType.Int80) return 80;
        if (fheType == FheType.Int88) return 88;
        if (fheType == FheType.Int96) return 96;
        if (fheType == FheType.Int104) return 104;
        if (fheType == FheType.Int112) return 112;
        if (fheType == FheType.Int120) return 120;
        if (fheType == FheType.Int128) return 128;
        if (fheType == FheType.Int136) return 136;
        if (fheType == FheType.Int144) return 144;
        if (fheType == FheType.Int152) return 152;
        if (fheType == FheType.Int160) return 160;
        if (fheType == FheType.Int168) return 168;
        if (fheType == FheType.Int176) return 176;
        if (fheType == FheType.Int184) return 184;
        if (fheType == FheType.Int192) return 192;
        if (fheType == FheType.Int200) return 200;
        if (fheType == FheType.Int208) return 208;
        if (fheType == FheType.Int216) return 216;
        if (fheType == FheType.Int224) return 224;
        if (fheType == FheType.Int232) return 232;
        if (fheType == FheType.Int240) return 240;
        if (fheType == FheType.Int248) return 248;
        if (fheType == FheType.Int256) return 256;
        if (fheType == FheType.Int512) return 512;
        if (fheType == FheType.Int1024) return 1024;
        if (fheType == FheType.Int2048) return 2048;

        revert UnsupportedType();
    }

    function _clamp(uint256 value, FheType fheType) internal pure returns (uint256) {
        return CleartextArithmetic.clamp(value, _bitWidthForType(fheType));
    }
}
