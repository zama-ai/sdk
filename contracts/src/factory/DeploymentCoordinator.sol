// SPDX-License-Identifier: BSD-3-Clause-Clear

pragma solidity 0.8.27;

import {ConfidentialWrapper} from "../wrapper/ERC7984ERC20WrapperUpgradeable.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";

/// @notice Coordinator that orchestrates deployment of confidential wrapper pairs
contract DeploymentCoordinator is Ownable2Step {
    /// @notice Canonical implementation address for all WrapperUpgradeable proxies
    address public wrapperImplementation;

    /// @notice Whether new wrapper deployments are allowed
    bool public canDeploy;

    /// @notice Mapping from original token address to deployed wrapper address
    mapping(address originalToken => ConfidentialWrapper wrapper) public deployedWrappers;

    error ZeroAddressWrapperImplementation();
    error ImplementationNotSet();
    error WrapperAlreadyExists();
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

    event WrapperImplementationUpdated(address indexed oldImplementation, address indexed newImplementation);
    event CanDeployUpdated(bool canDeploy);
    event DeployedWrapperSet(address indexed originalToken, address indexed wrapper);

    constructor(address wrapperImplementation_) Ownable(msg.sender) {
        require(address(wrapperImplementation_) != address(0), ZeroAddressWrapperImplementation());
        wrapperImplementation = wrapperImplementation_;
        canDeploy = true;
    }

    /// @notice Deploy a confidential wrapper for a given ERC-20 token
    function deploy(address originalToken_) external returns (ConfidentialWrapper wrapper) {
        require(canDeploy, DeploymentDisabled());
        require(address(deployedWrappers[originalToken_]) == address(0), WrapperAlreadyExists());
        require(originalToken_ == address(0) || originalToken_.code.length > 0, TokenMustExist());
        require(wrapperImplementation != address(0), ImplementationNotSet());

        string memory originalName;
        string memory originalSymbol;
        uint8 originalDecimals;
        (wrapper, originalName, originalSymbol, originalDecimals) = _deployWrapper(originalToken_);

        deployedWrappers[originalToken_] = wrapper;

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
        string memory contractURI = string.concat(
            "data:application/json;utf8,",
            '{"name":"',
            confidentialName,
            '","symbol":"',
            confidentialSymbol,
            '"}'
        );

        bytes memory data = abi.encodeCall(
            ConfidentialWrapper.initialize,
            (
                confidentialName,
                confidentialSymbol,
                contractURI,
                IERC20(originalToken_),
                msg.sender
            )
        );

        ERC1967Proxy proxy = new ERC1967Proxy(wrapperImplementation, data);
        wrapper = ConfidentialWrapper(payable(address(proxy)));
    }

    function setWrapperImplementation(address implementation_) external onlyOwner {
        require(implementation_ != address(0), ZeroAddressWrapperImplementation());
        address oldImplementation = wrapperImplementation;
        wrapperImplementation = implementation_;
        emit WrapperImplementationUpdated(oldImplementation, implementation_);
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

    function _fallbackUnderlyingDecimals() private pure returns (uint8) {
        return 18;
    }

    function _tryGetAssetDecimals(IERC20Metadata asset_) private view returns (uint8) {
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
}
