// SPDX-License-Identifier: MIT

pragma solidity ^0.8.27;

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {AdminProvider} from "../admin/AdminProvider.sol";
import {FeeManager} from "../admin/FeeManager.sol";

/// @title ERC7984TransferBatcher
/// @notice Batch processor for confidential transfers with retry mechanism
/// @custom:security-contact contact@zaiffer.org
contract ERC7984TransferBatcher is ZamaEthereumConfig {
    error InsufficientFee();
    error EmptyTransferArray();
    error FeeTransferFailed();

    /// @dev The given holder `holder` is not authorized to spend on behalf of `spender`.
    error ERC7984UnauthorizedSpender(address holder, address spender);

    event BatchTransferStart();
    event BatchTransferEnd(address indexed cToken, address indexed sender, uint256 fee);

    /// @dev AdminProvider contract for accessing fee manager
    AdminProvider public immutable adminProvider;

    /// @notice Constructs ERC7984TransferBatcher with admin provider reference
    /// @param adminProvider_ AdminProvider contract for accessing fee manager
    constructor(AdminProvider adminProvider_) {
        adminProvider = adminProvider_;
    }

    /// @notice Input structure for a single confidential transfer within a batch
    struct ConfidentialTransferInput {
        address to;
        externalEuint64 encryptedAmount;
        bytes inputProof;
        uint256 retryFor;
    }

    /// @notice Executes a batch of confidential transfers in a single transaction
    function confidentialBatchTransfer(
        IERC7984 cToken,
        address from,
        ConfidentialTransferInput[] calldata transfers
    ) external payable {
        if (transfers.length == 0) {
            revert EmptyTransferArray();
        }

        FeeManager feeManager = adminProvider.feeManager();
        uint64 requiredFee = feeManager.getBatchTransferFee();

        if (msg.value != requiredFee) {
            revert InsufficientFee();
        }

        require(cToken.isOperator(from, msg.sender), ERC7984UnauthorizedSpender(from, msg.sender));

        emit BatchTransferStart();
        for (uint256 i = 0; i < transfers.length; i++) {
            euint64 amount = FHE.fromExternal(
                transfers[i].encryptedAmount,
                transfers[i].inputProof
            );
            FHE.allowTransient(amount, address(cToken));

            cToken.confidentialTransferFrom(
                from,
                transfers[i].to,
                amount
            );
        }
        emit BatchTransferEnd(address(cToken), from, requiredFee);

        if (msg.value > 0) {
            address feeRecipient = feeManager.getFeeRecipient();
            (bool success, ) = feeRecipient.call{value: msg.value}("");
            require(success, FeeTransferFailed());
        }
    }
}
