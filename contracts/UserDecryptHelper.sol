// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

library UserDecryptHelper {
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant USER_DECRYPT_REQUEST_TYPEHASH = keccak256(
        "UserDecryptRequestVerification(bytes publicKey,address[] contractAddresses,uint256 startTimestamp,uint256 durationDays,bytes extraData)"
    );

    function computeUserDecryptDomainSeparator(uint256 chainId, address verifyingContract)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("Decryption")),
                keccak256(bytes("1")),
                chainId,
                verifyingContract
            )
        );
    }

    function computeUserDecryptDigest(
        bytes memory publicKey,
        address[] memory contractAddresses,
        uint256 startTimestamp,
        uint256 durationDays,
        bytes memory extraData,
        bytes32 domainSeparator
    ) internal pure returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                USER_DECRYPT_REQUEST_TYPEHASH,
                keccak256(publicKey),
                keccak256(abi.encodePacked(contractAddresses)),
                startTimestamp,
                durationDays,
                keccak256(extraData)
            )
        );

        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }
}
