// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

/// @notice Minimal on-chain registry that maps ERC-20 tokens to their confidential wrappers.
/// Implements the ConfidentialTokenWrappersRegistry interface expected by the SDK.
contract WrappersRegistry {
    struct TokenWrapperPair {
        address tokenAddress;
        address confidentialTokenAddress;
        bool isValid;
    }

    TokenWrapperPair[] private _pairs;
    /// @dev 1-indexed: 0 means "not found"
    mapping(address => uint256) private _tokenToIndex;
    mapping(address => uint256) private _confidentialToIndex;

    address private immutable _owner;

    error NotOwner();
    error IndexOutOfBounds();
    error InvalidSliceRange();
    error ZeroAddress();
    error TokenAlreadyRegistered();
    error ConfidentialTokenAlreadyRegistered();

    constructor() {
        _owner = msg.sender;
    }

    /// @notice Register a token ↔ confidential-token pair.
    function registerPair(address tokenAddress, address confidentialTokenAddress) external {
        if (msg.sender != _owner) revert NotOwner();
        if (tokenAddress == address(0)) revert ZeroAddress();
        if (confidentialTokenAddress == address(0)) revert ZeroAddress();
        if (_tokenToIndex[tokenAddress] != 0) revert TokenAlreadyRegistered();
        if (_confidentialToIndex[confidentialTokenAddress] != 0) revert ConfidentialTokenAlreadyRegistered();
        _pairs.push(TokenWrapperPair(tokenAddress, confidentialTokenAddress, true));
        uint256 idx = _pairs.length; // 1-indexed
        _tokenToIndex[tokenAddress] = idx;
        _confidentialToIndex[confidentialTokenAddress] = idx;
    }

    function getTokenConfidentialTokenPairs() external view returns (TokenWrapperPair[] memory) {
        return _pairs;
    }

    function getTokenConfidentialTokenPairsLength() external view returns (uint256) {
        return _pairs.length;
    }

    function getTokenConfidentialTokenPairsSlice(
        uint256 fromIndex,
        uint256 toIndex
    ) external view returns (TokenWrapperPair[] memory) {
        if (toIndex > _pairs.length) revert IndexOutOfBounds();
        if (fromIndex > toIndex) revert InvalidSliceRange();
        uint256 len = toIndex - fromIndex;
        TokenWrapperPair[] memory result = new TokenWrapperPair[](len);
        for (uint256 i = 0; i < len; i++) {
            result[i] = _pairs[fromIndex + i];
        }
        return result;
    }

    function getTokenConfidentialTokenPair(
        uint256 index
    ) external view returns (TokenWrapperPair memory) {
        if (index >= _pairs.length) revert IndexOutOfBounds();
        return _pairs[index];
    }

    function getConfidentialTokenAddress(
        address tokenAddress
    ) external view returns (bool found, address confidentialTokenAddress) {
        uint256 idx = _tokenToIndex[tokenAddress];
        if (idx == 0) return (false, address(0));
        return (true, _pairs[idx - 1].confidentialTokenAddress);
    }

    function getTokenAddress(
        address confidentialTokenAddress
    ) external view returns (bool found, address tokenAddress) {
        uint256 idx = _confidentialToIndex[confidentialTokenAddress];
        if (idx == 0) return (false, address(0));
        return (true, _pairs[idx - 1].tokenAddress);
    }

    function isConfidentialTokenValid(
        address confidentialTokenAddress
    ) external view returns (bool) {
        uint256 idx = _confidentialToIndex[confidentialTokenAddress];
        if (idx == 0) return false;
        return _pairs[idx - 1].isValid;
    }
}
