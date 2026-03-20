// SPDX-License-Identifier: BSD-3-Clause-Clear

pragma solidity 0.8.27;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {SanctionsList} from "./SanctionsList.sol";
import {FeeManager} from "./FeeManager.sol";

/// @title IAdminProvider
/// @notice Interface for AdminProvider configuration management
interface IAdminProvider {
    function sanctionsList() external view returns (SanctionsList);
    function feeManager() external view returns (FeeManager);
    function setSanctionsList(SanctionsList sanctionsList_) external;
    function setFeeManager(FeeManager feeManager_) external;

    error ZeroAddressFeeManager();
    error ZeroAddressSanctionsList();
    error ZeroAddressRegulator();

    event SanctionsListUpdated(address indexed oldSanctionsList, address indexed newSanctionsList);
    event FeeManagerUpdated(address indexed oldFeeManager, address indexed newFeeManager);
    event RegulatorUpdated(address indexed oldRegulator, address indexed newRegulator);
}

/// @title AdminProvider
/// @notice Centralized configuration provider for confidential token system
/// @custom:security-contact contact@zaiffer.org
contract AdminProvider is IAdminProvider, Ownable2Step {
    SanctionsList public sanctionsList;
    FeeManager public feeManager;
    address public regulator;

    constructor(FeeManager feeManager_, SanctionsList sanctionsList_, address regulator_) Ownable(msg.sender) {
        require(address(feeManager_) != address(0), ZeroAddressFeeManager());
        require(address(sanctionsList_) != address(0), ZeroAddressSanctionsList());
        require(regulator_ != address(0), ZeroAddressRegulator());
        feeManager = feeManager_;
        sanctionsList = sanctionsList_;
        regulator = regulator_;
    }

    function setSanctionsList(SanctionsList sanctionsList_) external onlyOwner {
        require(address(sanctionsList_) != address(0), ZeroAddressSanctionsList());
        address oldSanctionsList = address(sanctionsList);
        sanctionsList = sanctionsList_;
        emit SanctionsListUpdated(oldSanctionsList, address(sanctionsList_));
    }

    function setFeeManager(FeeManager feeManager_) external onlyOwner {
        require(address(feeManager_) != address(0), ZeroAddressFeeManager());
        address oldFeeManager = address(feeManager);
        feeManager = feeManager_;
        emit FeeManagerUpdated(oldFeeManager, address(feeManager_));
    }

    function setRegulator(address regulator_) external onlyOwner {
        require(regulator_ != address(0), ZeroAddressRegulator());
        address oldRegulator = regulator;
        regulator = regulator_;
        emit RegulatorUpdated(oldRegulator, regulator_);
    }
}
