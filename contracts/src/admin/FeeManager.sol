// SPDX-License-Identifier: BSD-3-Clause-Clear

pragma solidity 0.8.27;


import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {FHE, ebool, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title IFeeManager
/// @notice Interface for fee management in the confidential token system
interface IFeeManager {
    function getWrapFee(uint256 amount, address wrapFrom, address wrapTo) external view returns (uint256);
    function getUnwrapFee(uint64 amount, address unwrapFrom, address unwrapTo) external view returns (uint64);
    function getDeployFee(address deployer) external view returns (uint64);
    function getBatchTransferFee() external view returns (uint64);
    function getFeeRecipient() external view returns (address);
    function setWrapFeeBasisPoints(uint64 feeBasisPoints) external;
    function setUnwrapFeeBasisPoints(uint64 feeBasisPoints) external;
    function setSwapperWrapFeeBasisPoints(uint64 feeBasisPoints) external;
    function setSwapperUnwrapFeeBasisPoints(uint64 feeBasisPoints) external;
    function setDeployFee(uint64 deployFee) external;
    function setBatchTransferFee(uint64 batchTransferFee) external;
    function setFeeRecipient(address recipient) external;
    function setSwapperFeeWaiverActive(bool active) external;

    event WrapFeeBasisPointsUpdated(uint64 oldFeeBasisPoints, uint64 newFeeBasisPoints);
    event UnwrapFeeBasisPointsUpdated(uint64 oldFeeBasisPoints, uint64 newFeeBasisPoints);
    event SwapperWrapFeeBasisPointsUpdated(uint64 oldFeeBasisPoints, uint64 newFeeBasisPoints);
    event SwapperUnwrapFeeBasisPointsUpdated(uint64 oldFeeBasisPoints, uint64 newFeeBasisPoints);
    event DeployFeeUpdated(uint64 oldDeployFee, uint64 newDeployFee);
    event BatchTransferFeeUpdated(uint64 oldBatchTransferFee, uint64 newBatchTransferFee);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event SwapperFeeWaiverUpdated(bool active);
}

/// @title FeeManager
/// @notice Manages all fee configuration for the confidential token system
/// @dev Uses AccessControl with FEE_MANAGER_ROLE for fee parameter updates
/// @dev Supports both basis point fees (wrap/unwrap) and fixed fees (deploy/batch transfer)
/// @dev Fee ranges:
///      - Wrap/Unwrap: 0-10,000 basis points (0%-100%)
///      - Deploy: 0-type(uint64).max wei
///      - Batch Transfer: 0-type(uint64).max wei
/// @dev Special feature: SWAPPER_ROLE fee waiver for authorized swapper contracts
/// @custom:security-contact contact@zaiffer.org
contract FeeManager is IFeeManager, AccessControl, ZamaEthereumConfig {
    /// @dev Role identifier for swapper contracts eligible for fee waivers
    bytes32 public constant SWAPPER_ROLE = keccak256("SWAPPER_ROLE");

    /// @dev Role identifier for accounts authorized to modify fee parameters
    bytes32 public constant FEE_MANAGER_ROLE = keccak256("FEE_MANAGER_ROLE");

    /// @dev Maximum allowed basis points (10,000 = 100%)
    uint64 public constant MAX_BASIS_POINTS = 10_000;

    /// @dev Wrap fee in basis points (1 = 0.01%, 100 = 1%, 10000 = 100%)
    uint64 public wrapFeeBasisPoints;

    /// @dev Unwrap fee in basis points (1 = 0.01%, 100 = 1%, 10000 = 100%)
    uint64 public unwrapFeeBasisPoints;

    /// @dev Wrap fee for swappers in basis points when swapperFeeWaiverActive is true
    uint64 public swapperWrapFeeBasisPoints;

    /// @dev Unwrap fee for swappers in basis points when swapperFeeWaiverActive is true
    uint64 public swapperUnwrapFeeBasisPoints;

    /// @dev Fixed fee in wei for deploying new wrapper pairs
    uint64 public deployFee;

    /// @dev Fixed fee in wei for batch confidential transfers
    uint64 public batchTransferFee;

    /// @dev Address that receives all collected protocol fees
    address public feeRecipient;

    /// @dev When true, addresses with SWAPPER_ROLE pay swapperWrapFeeBasisPoints/swapperUnwrapFeeBasisPoints instead of standard fees
    bool public swapperFeeWaiverActive;

    error ZeroAddressFeeRecipient();
    error FeeExceedsMaximum();

    /// @notice Constructs FeeManager with initial fee configuration
    /// @param wrapFeeBasisPoints_ Initial wrap fee in basis points (0-10,000)
    /// @param unwrapFeeBasisPoints_ Initial unwrap fee in basis points (0-10,000)
    /// @param deployFee_ Initial deployment fee in wei
    /// @param batchTransferFee_ Initial batch transfer fee in wei
    /// @param feeRecipient_ Address that will receive protocol fees
    /// @dev Grants DEFAULT_ADMIN_ROLE to msg.sender
    /// @dev Reverts if feeRecipient_ is zero address
    /// @dev Reverts if wrap or unwrap fee basis points exceed MAX_BASIS_POINTS
    /// @dev Initializes swapper fees to 0 by default
    constructor(
        uint64 wrapFeeBasisPoints_,
        uint64 unwrapFeeBasisPoints_,
        uint64 deployFee_,
        uint64 batchTransferFee_,
        address feeRecipient_
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        require(feeRecipient_ != address(0), ZeroAddressFeeRecipient());
        require(wrapFeeBasisPoints_ <= MAX_BASIS_POINTS, FeeExceedsMaximum());
        require(unwrapFeeBasisPoints_ <= MAX_BASIS_POINTS, FeeExceedsMaximum());
        wrapFeeBasisPoints = wrapFeeBasisPoints_;
        unwrapFeeBasisPoints = unwrapFeeBasisPoints_;
        swapperWrapFeeBasisPoints = 0;
        swapperUnwrapFeeBasisPoints = 0;
        deployFee = deployFee_;
        batchTransferFee = batchTransferFee_;
        feeRecipient = feeRecipient_;
    }

    /// @notice Calculates the wrap fee for a given amount and addresses
    function getWrapFee(uint256 amount, address wrapFrom, address wrapTo) external view returns (uint256) {
        uint64 feeBasisPoints = (swapperFeeWaiverActive && hasRole(SWAPPER_ROLE, wrapFrom))
            ? swapperWrapFeeBasisPoints
            : wrapFeeBasisPoints;

        uint256 fee = amount * feeBasisPoints;
        return (fee + MAX_BASIS_POINTS - 1) / MAX_BASIS_POINTS;
    }

    /// @notice Calculates the unwrap fee for a given amount and addresses
    function getUnwrapFee(uint64 amount, address unwrapFrom, address unwrapTo) external view returns (uint64) {
        return getFee(amount, getUnwrapFeeBasisPoints(unwrapFrom, unwrapTo));
    }

    /// @notice Returns the unwrap fee basis points for given addresses
    function getUnwrapFeeBasisPoints(address unwrapFrom, address unwrapTo) public view returns (uint64) {
        if (swapperFeeWaiverActive && hasRole(SWAPPER_ROLE, unwrapTo)) {
            return swapperUnwrapFeeBasisPoints;
        }
        return unwrapFeeBasisPoints;
    }

    /// @notice Calculates a fee given an amount and basis points
    function getFee(uint64 amount, uint64 basisPoints) public view returns (uint64) {
        uint256 fee = uint256(amount) * uint256(basisPoints);
        return uint64((fee + MAX_BASIS_POINTS - 1) / MAX_BASIS_POINTS);
    }

    /// @notice Returns the fixed deployment fee
    function getDeployFee(address deployer) external view returns (uint64) {
        return deployFee;
    }

    /// @notice Returns the fixed batch transfer fee
    function getBatchTransferFee() external view returns (uint64) {
        return batchTransferFee;
    }

    /// @notice Returns the current fee recipient address
    function getFeeRecipient() external view returns (address) {
        return feeRecipient;
    }

    function setWrapFeeBasisPoints(uint64 feeBasisPoints) external onlyRole(FEE_MANAGER_ROLE) {
        require(feeBasisPoints <= MAX_BASIS_POINTS, FeeExceedsMaximum());
        uint64 oldFeeBasisPoints = wrapFeeBasisPoints;
        wrapFeeBasisPoints = feeBasisPoints;
        emit WrapFeeBasisPointsUpdated(oldFeeBasisPoints, feeBasisPoints);
    }

    function setUnwrapFeeBasisPoints(uint64 feeBasisPoints) external onlyRole(FEE_MANAGER_ROLE) {
        require(feeBasisPoints <= MAX_BASIS_POINTS, FeeExceedsMaximum());
        uint64 oldFeeBasisPoints = unwrapFeeBasisPoints;
        unwrapFeeBasisPoints = feeBasisPoints;
        emit UnwrapFeeBasisPointsUpdated(oldFeeBasisPoints, feeBasisPoints);
    }

    function setSwapperWrapFeeBasisPoints(uint64 feeBasisPoints) external onlyRole(FEE_MANAGER_ROLE) {
        require(feeBasisPoints <= MAX_BASIS_POINTS, FeeExceedsMaximum());
        uint64 oldFeeBasisPoints = swapperWrapFeeBasisPoints;
        swapperWrapFeeBasisPoints = feeBasisPoints;
        emit SwapperWrapFeeBasisPointsUpdated(oldFeeBasisPoints, feeBasisPoints);
    }

    function setSwapperUnwrapFeeBasisPoints(uint64 feeBasisPoints) external onlyRole(FEE_MANAGER_ROLE) {
        require(feeBasisPoints <= MAX_BASIS_POINTS, FeeExceedsMaximum());
        uint64 oldFeeBasisPoints = swapperUnwrapFeeBasisPoints;
        swapperUnwrapFeeBasisPoints = feeBasisPoints;
        emit SwapperUnwrapFeeBasisPointsUpdated(oldFeeBasisPoints, feeBasisPoints);
    }

    function setDeployFee(uint64 newDeployFee) external onlyRole(FEE_MANAGER_ROLE) {
        uint64 oldDeployFee = deployFee;
        deployFee = newDeployFee;
        emit DeployFeeUpdated(oldDeployFee, newDeployFee);
    }

    function setBatchTransferFee(uint64 newBatchTransferFee) external onlyRole(FEE_MANAGER_ROLE) {
        uint64 oldBatchTransferFee = batchTransferFee;
        batchTransferFee = newBatchTransferFee;
        emit BatchTransferFeeUpdated(oldBatchTransferFee, newBatchTransferFee);
    }

    function setFeeRecipient(address recipient) external onlyRole(FEE_MANAGER_ROLE) {
        require(recipient != address(0), ZeroAddressFeeRecipient());
        address oldRecipient = feeRecipient;
        feeRecipient = recipient;
        emit FeeRecipientUpdated(oldRecipient, recipient);
    }

    function setSwapperFeeWaiverActive(bool active) external onlyRole(FEE_MANAGER_ROLE) {
        swapperFeeWaiverActive = active;
        emit SwapperFeeWaiverUpdated(active);
    }
}
