// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {FHEEvents} from "@fhevm/host-contracts/contracts/FHEEvents.sol";
import {fhevmExecutorAdd} from "@fhevm/host-contracts/addresses/FHEVMHostAddresses.sol";
import {FheType} from "@fhevm/host-contracts/contracts/shared/FheType.sol";
import {CleartextArithmetic} from "./CleartextArithmetic.sol";
import {FheTypeBitWidth} from "./FheTypeBitWidth.sol";

abstract contract PlaintextDBMixin is Test, FHEEvents {
    mapping(bytes32 => uint256) internal _plaintexts;

    function _processNewLogs() internal {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter != fhevmExecutorAdd) {
                continue;
            }
            _dispatchFheEvent(logs[i]);
        }
    }

    function _dispatchFheEvent(Vm.Log memory logEntry) internal {
        bytes32 selector = logEntry.topics[0];

        if (selector == FheAdd.selector) {
            _handleAdd(logEntry.data);
        } else if (selector == FheSub.selector) {
            _handleSub(logEntry.data);
        } else if (selector == FheMul.selector) {
            _handleMul(logEntry.data);
        } else if (selector == FheDiv.selector) {
            _handleDiv(logEntry.data);
        } else if (selector == FheRem.selector) {
            _handleRem(logEntry.data);
        } else if (selector == FheBitAnd.selector) {
            _handleBitAnd(logEntry.data);
        } else if (selector == FheBitOr.selector) {
            _handleBitOr(logEntry.data);
        } else if (selector == FheBitXor.selector) {
            _handleBitXor(logEntry.data);
        } else if (selector == FheShl.selector) {
            _handleShl(logEntry.data);
        } else if (selector == FheShr.selector) {
            _handleShr(logEntry.data);
        } else if (selector == FheRotl.selector) {
            _handleRotl(logEntry.data);
        } else if (selector == FheRotr.selector) {
            _handleRotr(logEntry.data);
        } else if (selector == FheEq.selector) {
            _handleEq(logEntry.data);
        } else if (selector == FheNe.selector) {
            _handleNe(logEntry.data);
        } else if (selector == FheGe.selector) {
            _handleGe(logEntry.data);
        } else if (selector == FheGt.selector) {
            _handleGt(logEntry.data);
        } else if (selector == FheLe.selector) {
            _handleLe(logEntry.data);
        } else if (selector == FheLt.selector) {
            _handleLt(logEntry.data);
        } else if (selector == FheMin.selector) {
            _handleMin(logEntry.data);
        } else if (selector == FheMax.selector) {
            _handleMax(logEntry.data);
        } else if (selector == FheNeg.selector) {
            _handleNeg(logEntry.data);
        } else if (selector == FheNot.selector) {
            _handleNot(logEntry.data);
        } else if (selector == TrivialEncrypt.selector) {
            _handleTrivialEncrypt(logEntry.data);
        } else if (selector == Cast.selector) {
            _handleCast(logEntry.data);
        } else if (selector == FheIfThenElse.selector) {
            _handleIfThenElse(logEntry.data);
        } else if (selector == FheRand.selector) {
            _handleRand(logEntry.data);
        } else if (selector == FheRandBounded.selector) {
            _handleRandBounded(logEntry.data);
        } else if (selector == VerifyInput.selector) {
            _handleVerifyInput(logEntry.data);
        }
    }

    function _loadBinaryOperands(bytes memory data)
        private
        view
        returns (bytes32 lhs, bytes32 rhs, bytes1 scalarByte, bytes32 result, FheType operandType, uint256 a, uint256 b)
    {
        (lhs, rhs, scalarByte, result) = abi.decode(data, (bytes32, bytes32, bytes1, bytes32));
        operandType = _typeOf(lhs);
        a = _clamp(_plaintexts[lhs], operandType);
        b = (scalarByte == 0x01) ? uint256(rhs) : _clamp(_plaintexts[rhs], operandType);
    }

    function _handleAdd(bytes memory data) private {
        (,,, bytes32 result, FheType t, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = CleartextArithmetic.add(a, b, _bitWidthForType(t));
    }

    function _handleSub(bytes memory data) private {
        (,,, bytes32 result, FheType t, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = CleartextArithmetic.sub(a, b, _bitWidthForType(t));
    }

    function _handleMul(bytes memory data) private {
        (,,, bytes32 result, FheType t, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = CleartextArithmetic.mul(a, b, _bitWidthForType(t));
    }

    function _handleDiv(bytes memory data) private {
        (,,, bytes32 result,, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = a / b;
    }

    function _handleRem(bytes memory data) private {
        (,,, bytes32 result,, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = a % b;
    }

    function _handleBitAnd(bytes memory data) private {
        (,,, bytes32 result, FheType t, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = CleartextArithmetic.bitAnd(a, b, _bitWidthForType(t));
    }

    function _handleBitOr(bytes memory data) private {
        (,,, bytes32 result, FheType t, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = CleartextArithmetic.bitOr(a, b, _bitWidthForType(t));
    }

    function _handleBitXor(bytes memory data) private {
        (,,, bytes32 result, FheType t, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = CleartextArithmetic.bitXor(a, b, _bitWidthForType(t));
    }

    function _handleShl(bytes memory data) private {
        (,,, bytes32 result, FheType t, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = CleartextArithmetic.shl(a, b, _bitWidthForType(t));
    }

    function _handleShr(bytes memory data) private {
        (,,, bytes32 result, FheType t, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = CleartextArithmetic.shr(a, b, _bitWidthForType(t));
    }

    function _handleRotl(bytes memory data) private {
        (,,, bytes32 result, FheType t, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = CleartextArithmetic.rotl(a, b, _bitWidthForType(t));
    }

    function _handleRotr(bytes memory data) private {
        (,,, bytes32 result, FheType t, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = CleartextArithmetic.rotr(a, b, _bitWidthForType(t));
    }

    function _handleEq(bytes memory data) private {
        (,,, bytes32 result,, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = (a == b) ? 1 : 0;
    }

    function _handleNe(bytes memory data) private {
        (,,, bytes32 result,, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = (a != b) ? 1 : 0;
    }

    function _handleGe(bytes memory data) private {
        (,,, bytes32 result,, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = (a >= b) ? 1 : 0;
    }

    function _handleGt(bytes memory data) private {
        (,,, bytes32 result,, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = (a > b) ? 1 : 0;
    }

    function _handleLe(bytes memory data) private {
        (,,, bytes32 result,, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = (a <= b) ? 1 : 0;
    }

    function _handleLt(bytes memory data) private {
        (,,, bytes32 result,, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = (a < b) ? 1 : 0;
    }

    function _handleMin(bytes memory data) private {
        (,,, bytes32 result,, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = (a < b) ? a : b;
    }

    function _handleMax(bytes memory data) private {
        (,,, bytes32 result,, uint256 a, uint256 b) = _loadBinaryOperands(data);
        _plaintexts[result] = (a > b) ? a : b;
    }

    function _handleNeg(bytes memory data) private {
        (bytes32 ct, bytes32 result) = abi.decode(data, (bytes32, bytes32));
        FheType t = _typeOf(ct);
        uint256 value = _clamp(_plaintexts[ct], t);
        _plaintexts[result] = CleartextArithmetic.neg(value, _bitWidthForType(t));
    }

    function _handleNot(bytes memory data) private {
        (bytes32 ct, bytes32 result) = abi.decode(data, (bytes32, bytes32));
        FheType t = _typeOf(ct);
        uint256 value = _clamp(_plaintexts[ct], t);
        _plaintexts[result] = CleartextArithmetic.bitNot(value, _bitWidthForType(t));
    }

    function _handleTrivialEncrypt(bytes memory data) private {
        (uint256 pt,, bytes32 result) = abi.decode(data, (uint256, uint8, bytes32));
        _plaintexts[result] = pt;
    }

    function _handleCast(bytes memory data) private {
        (bytes32 ct, uint8 toTypeRaw, bytes32 result) = abi.decode(data, (bytes32, uint8, bytes32));
        _plaintexts[result] = _clamp(_plaintexts[ct], FheType(toTypeRaw));
    }

    function _handleIfThenElse(bytes memory data) private {
        (bytes32 control, bytes32 ifTrue, bytes32 ifFalse, bytes32 result) =
            abi.decode(data, (bytes32, bytes32, bytes32, bytes32));
        _plaintexts[result] = (_plaintexts[control] == 1) ? _plaintexts[ifTrue] : _plaintexts[ifFalse];
    }

    function _handleRand(bytes memory data) private {
        (uint8 randTypeRaw, bytes16 seed, bytes32 result) = abi.decode(data, (uint8, bytes16, bytes32));
        _plaintexts[result] = CleartextArithmetic.rand(seed, _bitWidthForType(FheType(randTypeRaw)));
    }

    function _handleRandBounded(bytes memory data) private {
        (uint256 upperBound,, bytes16 seed, bytes32 result) = abi.decode(data, (uint256, uint8, bytes16, bytes32));
        _plaintexts[result] = CleartextArithmetic.randBounded(seed, upperBound);
    }

    function _handleVerifyInput(bytes memory data) private pure {
        (bytes32 inputHandle,,,, bytes32 result) = abi.decode(data, (bytes32, address, bytes, uint8, bytes32));
        assert(inputHandle == result);
    }

    function _typeOf(bytes32 handle) internal pure returns (FheType typeCt) {
        typeCt = FheType(uint8(handle[30]));
    }

    function _bitWidthForType(FheType fheType) internal pure returns (uint256) {
        return FheTypeBitWidth.bitWidthForType(uint8(fheType));
    }

    function _clamp(uint256 value, FheType fheType) internal pure returns (uint256) {
        return CleartextArithmetic.clamp(value, _bitWidthForType(fheType));
    }

    function _seedPlaintext(bytes32 handle, uint256 value) internal {
        _plaintexts[handle] = value;
    }

    function _readPlaintext(bytes32 handle) internal returns (uint256) {
        _processNewLogs();
        return _plaintexts[handle];
    }
}
