// SPDX-License-Identifier: BSD-3-Clause-Clear

pragma solidity 0.8.27;

import {ConfidentialWrapper} from "../wrapper/ERC7984ERC20WrapperUpgradeable.sol";
import {RegulatedERC7984Upgradeable} from "../token/RegulatedERC7984Upgradeable.sol";
import {AdminProvider} from "../admin/AdminProvider.sol";
import {FeeManager} from "../admin/FeeManager.sol";
import {IDeploymentCoordinator} from "../interfaces/IDeploymentCoordinator.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";

/// @notice Coordinator that orchestrates deployment using specialized factories
/// @custom:security-contact contact@zaiffer.org
contract DeploymentCoordinator is Ownable2Step {
    AdminProvider public adminProvider;

    /// @notice Canonical implementation address for all WrapperUpgradeable proxies
    address public wrapperImplementation;

    /// @notice Whether new wrapper deployments are allowed
    bool public canDeploy;

    /// @notice Mapping from original token address to deployed wrapper address (for compatibility)
    mapping(address originalToken => ConfidentialWrapper wrapper) public deployedWrappers;

    error ZeroAddressAdminProvider();
    error ZeroAddressWrapperFactory();
    error ZeroAddressConfidentialTokenFactory();
    error ZeroAddressImplementation();
    error IncorrectDeployFee();
    error WrapperAlreadyExists();
    error FeeTransferFailed();
    error ImplementationNotSet();
    error TokenMustExist();
    error DeploymentDisabled();
    error ZeroAddressWrapper();

    event WrapperDeployed(
        address indexed originalToken,
        address indexed wrapper,
        string originalName,
        string originalSymbol,
        uint8 originalDecimals,
        address deployer
   );

    event AdminProviderUpdated(address indexed oldAdminProvider, address indexed newAdminProvider);
    event WrapperFactoryUpdated(address indexed oldWrapperFactory, address indexed newWrapperFactory);
    event WrapperImplementationUpdated(address indexed oldImplementation, address indexed newImplementation);
    event CanDeployUpdated(bool canDeploy);
    event DeployedWrapperSet(address indexed originalToken, address indexed wrapper);

    constructor(
        AdminProvider adminProvider_,
        address wrapperImplementation_
    ) Ownable(msg.sender) {
        require(address(adminProvider_) != address(0), ZeroAddressAdminProvider());
        require(address(wrapperImplementation_) != address(0), ZeroAddressImplementation());

        adminProvider = adminProvider_;
        wrapperImplementation = wrapperImplementation_;
        canDeploy = true;
    }

    /// @notice Deploy a wrapper/cToken pair for a given token (maintains original interface)
    function deploy(address originalToken_)
        external
        payable
        returns (ConfidentialWrapper wrapper)
    {
        require(canDeploy, DeploymentDisabled());
        uint64 requiredFee = _getDeployFee();
        require(msg.value == requiredFee, IncorrectDeployFee());
        require(address(deployedWrappers[originalToken_]) == address(0), WrapperAlreadyExists());
        require(originalToken_ == address(0) || originalToken_.code.length > 0, TokenMustExist());
        require(wrapperImplementation != address(0), ImplementationNotSet());

        string memory originalName;
        string memory originalSymbol;
        uint8 originalDecimals;
        (
            wrapper,
            originalName,
            originalSymbol,
            originalDecimals
        ) = _deployWrapper(originalToken_);

        deployedWrappers[originalToken_] = wrapper;

        if (msg.value > 0) {
            address feeRecipient = _getFeeRecipient();
            (bool success, ) = feeRecipient.call{value: msg.value}("");
            require(success, FeeTransferFailed());
        }

        emit WrapperDeployed(
            originalToken_,
            address(wrapper),
            originalName,
            originalSymbol,
            originalDecimals,
            msg.sender
        );
    }

    function getWrapper(address originalToken_) external view returns (address) {
        return address(deployedWrappers[originalToken_]);
    }

    function wrapperExists(address originalToken_) external view returns (bool) {
        return address(deployedWrappers[originalToken_]) != address(0);
    }

    function _deployWrapper(address originalToken_)
        internal
        returns (ConfidentialWrapper wrapper, string memory originalName, string memory originalSymbol, uint8 originalDecimals)
    {
        if (originalToken_ != address(0)) {
            originalName = _tryGetAssetName(originalToken_);
            originalSymbol = _tryGetAssetSymbol(originalToken_);
            originalDecimals = _tryGetAssetDecimals(IERC20Metadata(originalToken_));
        } else {
            originalName = "Ethereum";
            originalSymbol = "ETH";
            originalDecimals = 18;
        }

        string memory confidentialName = string.concat("Confidential ", originalName);
        string memory confidentialSymbol = string.concat("c", originalSymbol);
        string memory description = string.concat(
            "Confidential wrapper of ",
            originalSymbol,
            " shielding it into a confidential token"
        );

        string memory contractURI = string.concat(
            "data:application/json;utf8,",
            '{"name":"',
            confidentialName,
            '","symbol":"',
            confidentialSymbol,
            '","description":"',
            description,
            '"}'
        );

        bytes memory data = abi.encodeCall(
            ConfidentialWrapper.initialize,
            (
                string.concat("Confidential ", originalName),
                string.concat("c", originalSymbol),
                contractURI,
                IERC20(originalToken_),
                adminProvider.owner(),
                IDeploymentCoordinator(address(this))
            )
        );

        ERC1967Proxy proxy = new ERC1967Proxy(wrapperImplementation, data);
        wrapper = ConfidentialWrapper(payable(address(proxy)));
    }

    function _getDeployFee() private view returns (uint64) {
        FeeManager feeManager = adminProvider.feeManager();
        return feeManager.getDeployFee(msg.sender);
    }

    function _getFeeRecipient() private view returns (address) {
        FeeManager feeManager = adminProvider.feeManager();
        return feeManager.getFeeRecipient();
    }

    function _fallbackUnderlyingDecimals() private pure returns (uint8) {
        return 18;
    }

    function _maxDecimals() private pure returns (uint8) {
        return 6;
    }

    function _tryGetAssetDecimals(IERC20Metadata asset_) private view returns (uint8 assetDecimals) {
        (bool success, bytes memory encodedDecimals) = address(asset_).staticcall(
            abi.encodeCall(IERC20Metadata.decimals, ())
        );
        if (success && encodedDecimals.length == 32) {
            return abi.decode(encodedDecimals, (uint8));
        }
        return _fallbackUnderlyingDecimals();
    }

    function _tryGetAssetName(address token_) private view returns (string memory) {
        (bool success, bytes memory result) = token_.staticcall(abi.encodeWithSignature("name()"));
        if (success) {
            string memory parsed = _parseStringOrBytes32(result);
            if (bytes(parsed).length > 0) {
                return parsed;
            }
        }
        return Strings.toHexString(token_);
    }

    function _tryGetAssetSymbol(address token_) private view returns (string memory) {
        (bool success, bytes memory result) = token_.staticcall(abi.encodeWithSignature("symbol()"));
        if (success) {
            string memory parsed = _parseStringOrBytes32(result);
            if (bytes(parsed).length > 0) {
                return parsed;
            }
        }
        string memory fullAddress = Strings.toHexString(token_);
        return _substring(fullAddress, 0, 8);
    }

    function _parseStringOrBytes32(bytes memory data) private view returns (string memory) {
        if (data.length >= 64) {
            try this._externalDecodeString(data) returns (string memory str) {
                return str;
            } catch {}
        }
        if (data.length == 32) {
            bytes32 b32 = abi.decode(data, (bytes32));
            return _bytes32ToString(b32);
        }
        return "";
    }

    function _externalDecodeString(bytes memory data) external pure returns (string memory) {
        return abi.decode(data, (string));
    }

    function _bytes32ToString(bytes32 data) private pure returns (string memory) {
        uint256 length = 0;
        for (uint256 i = 0; i < 32; i++) {
            if (data[i] != 0) {
                length = i + 1;
            }
        }
        bytes memory result = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            result[i] = data[i];
        }
        return string(result);
    }

    function _substring(string memory str, uint256 startIndex, uint256 endIndex) private pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        require(endIndex <= strBytes.length && startIndex < endIndex, "Invalid substring indices");
        bytes memory result = new bytes(endIndex - startIndex);
        for (uint256 i = startIndex; i < endIndex; i++) {
            result[i - startIndex] = strBytes[i];
        }
        return string(result);
    }

    function setWrapperImplementation(address implementation_) external onlyOwner {
        require(implementation_ != address(0), ZeroAddressImplementation());
        address oldImplementation = wrapperImplementation;
        wrapperImplementation = implementation_;
        emit WrapperImplementationUpdated(oldImplementation, implementation_);
    }

    function setAdminProvider(AdminProvider adminProvider_) external onlyOwner {
        require(address(adminProvider_) != address(0), ZeroAddressAdminProvider());
        address oldAdminProvider = address(adminProvider);
        adminProvider = adminProvider_;
        emit AdminProviderUpdated(oldAdminProvider, address(adminProvider_));
    }

    function setCanDeploy(bool canDeploy_) external onlyOwner {
        canDeploy = canDeploy_;
        emit CanDeployUpdated(canDeploy_);
    }

    function setDeployedWrapper(address originalToken_, ConfidentialWrapper wrapper_) external onlyOwner {
        require(address(wrapper_) != address(0), ZeroAddressWrapper());
        deployedWrappers[originalToken_] = wrapper_;
        emit DeployedWrapperSet(originalToken_, address(wrapper_));
    }
}
