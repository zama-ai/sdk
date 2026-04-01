// SPDX-License-Identifier: MIT
// Ported from https://github.com/OpenZeppelin/openzeppelin-confidential-contracts/blob/f0914b66f9f3766915403587b1ef1432d53054d3/contracts/token/ERC7984/extensions/ERC7984ERC20Wrapper.sol
// (0.3.0 version)
pragma solidity ^0.8.27;

import {FHE, externalEuint64, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {IERC1363Receiver} from "@openzeppelin/contracts/interfaces/IERC1363Receiver.sol";
import {ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/interfaces/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {ERC7984Upgradeable} from "../token/ERC7984Upgradeable.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC7984ERC20Wrapper} from "../interfaces/IERC7984ERC20Wrapper.sol";
import {ZamaEthereumConfigUpgradeable} from "../fhevm/ZamaEthereumConfigUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

/**
 * @title ERC7984ERC20WrapperUpgradeable
 * @dev An upgradeable wrapper contract built on top of {ERC7984Upgradeable} that allows wrapping an `ERC20` token
 * into an `ERC7984` token. The wrapper contract implements the `IERC1363Receiver` interface
 * which allows users to transfer `ERC1363` tokens directly to the wrapper with a callback to wrap the tokens.
 *
 * WARNING: Minting assumes the full amount of the underlying token transfer has been received, hence some non-standard
 * tokens such as fee-on-transfer or other deflationary-type tokens are not supported by this wrapper.
 */
abstract contract ERC7984ERC20WrapperUpgradeable is ERC7984Upgradeable, IERC7984ERC20Wrapper, IERC1363Receiver {
    /// @custom:storage-location erc7201:fhevm_protocol.storage.ERC7984ERC20WrapperUpgradeable
    struct ERC7984ERC20WrapperStorage {
        IERC20 _underlying;
        uint8 _decimals;
        uint256 _rate;
        mapping(euint64 unwrapAmount => address recipient) _unwrapRequests;
    }

    // keccak256(abi.encode(uint256(keccak256("fhevm_protocol.storage.ERC7984ERC20WrapperUpgradeable")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant ERC7984_ERC20_WRAPPER_UPGRADEABLE_STORAGE_LOCATION =
        0x789981291a45bfde11e7ba326d04f33e2215f03c85dfc0acebcc6167a5924700;

    event UnwrapRequested(address indexed receiver, euint64 amount);
    event UnwrapFinalized(address indexed receiver, euint64 encryptedAmount, uint64 cleartextAmount);

    error InvalidUnwrapRequest(euint64 amount);
    error ERC7984TotalSupplyOverflow();

    function _getERC7984ERC20WrapperStorage() internal pure returns (ERC7984ERC20WrapperStorage storage $) {
        assembly {
            $.slot := ERC7984_ERC20_WRAPPER_UPGRADEABLE_STORAGE_LOCATION
        }
    }

    function __ERC7984ERC20Wrapper_init(IERC20 underlying_) internal onlyInitializing {
        __ERC7984ERC20Wrapper_init_unchained(underlying_);
    }

    function __ERC7984ERC20Wrapper_init_unchained(IERC20 underlying_) internal onlyInitializing {
        ERC7984ERC20WrapperStorage storage $ = _getERC7984ERC20WrapperStorage();
        $._underlying = underlying_;

        uint8 tokenDecimals = _tryGetAssetDecimals(underlying_);
        uint8 maxDecimals = _maxDecimals();
        if (tokenDecimals > maxDecimals) {
            $._decimals = maxDecimals;
            $._rate = 10 ** (tokenDecimals - maxDecimals);
        } else {
            $._decimals = tokenDecimals;
            $._rate = 1;
        }
    }

    /**
     * @dev `ERC1363` callback function which wraps tokens to the address specified in `data` or
     * the address `from` (if no address is specified in `data`).
     */
    function onTransferReceived(
        address /*operator*/,
        address from,
        uint256 amount,
        bytes calldata data
    ) public virtual returns (bytes4) {
        // check caller is the token contract
        require(address(underlying()) == msg.sender, ERC7984UnauthorizedCaller(msg.sender));

        // mint confidential token
        address to = data.length < 20 ? from : address(bytes20(data));
        _mint(to, FHE.asEuint64(SafeCast.toUint64(amount / rate())));

        // transfer excess back to the sender
        uint256 excess = amount % rate();
        if (excess > 0) SafeERC20.safeTransfer(IERC20(underlying()), from, excess);

        // return magic value
        return IERC1363Receiver.onTransferReceived.selector;
    }

    /**
     * @dev See {IERC7984ERC20Wrapper-wrap}.
     */
    function wrap(address to, uint256 amount) public virtual override {
        // take ownership of the tokens
        SafeERC20.safeTransferFrom(IERC20(underlying()), msg.sender, address(this), amount - (amount % rate()));

        // mint confidential token
        _mint(to, FHE.asEuint64(SafeCast.toUint64(amount / rate())));
    }

    /**
     * @dev Unwrap without passing an input proof.
     */
    function unwrap(address from, address to, euint64 amount) public virtual {
        require(FHE.isAllowed(amount, msg.sender), ERC7984UnauthorizedUseOfEncryptedAmount(amount, msg.sender));
        _unwrap(from, to, amount);
    }

    /**
     * @dev See {IERC7984ERC20Wrapper-unwrap}.
     */
    function unwrap(
        address from,
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) public virtual override {
        _unwrap(from, to, FHE.fromExternal(encryptedAmount, inputProof));
    }

    /// @inheritdoc IERC7984ERC20Wrapper
    function finalizeUnwrap(
        euint64 burntAmount,
        uint64 burntAmountCleartext,
        bytes calldata decryptionProof
    ) public virtual {
        ERC7984ERC20WrapperStorage storage $ = _getERC7984ERC20WrapperStorage();
        address to = $._unwrapRequests[burntAmount];
        require(to != address(0), InvalidUnwrapRequest(burntAmount));
        delete $._unwrapRequests[burntAmount];

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = euint64.unwrap(burntAmount);

        bytes memory cleartexts = abi.encode(burntAmountCleartext);

        FHE.checkSignatures(handles, cleartexts, decryptionProof);

        SafeERC20.safeTransfer(IERC20(underlying()), to, burntAmountCleartext * rate());

        emit UnwrapFinalized(to, burntAmount, burntAmountCleartext);
    }

    /// @inheritdoc ERC7984Upgradeable
    function decimals() public view virtual override(IERC7984, ERC7984Upgradeable) returns (uint8) {
        ERC7984ERC20WrapperStorage storage $ = _getERC7984ERC20WrapperStorage();
        return $._decimals;
    }

    /**
     * @dev Returns the rate at which the underlying token is converted to the wrapped token.
     */
    function rate() public view virtual returns (uint256) {
        ERC7984ERC20WrapperStorage storage $ = _getERC7984ERC20WrapperStorage();
        return $._rate;
    }

    /// @inheritdoc IERC7984ERC20Wrapper
    function underlying() public view virtual override returns (address) {
        ERC7984ERC20WrapperStorage storage $ = _getERC7984ERC20WrapperStorage();
        return address($._underlying);
    }

    /// @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(IERC165, ERC7984Upgradeable) returns (bool) {
        return interfaceId == type(IERC7984ERC20Wrapper).interfaceId || super.supportsInterface(interfaceId);
    }

    function totalSupply() public view virtual returns (uint256) {
        return IERC20(underlying()).balanceOf(address(this)) / rate();
    }

    function maxTotalSupply() public view virtual returns (uint256) {
        return type(uint64).max;
    }

    function _checkConfidentialTotalSupply() internal virtual {
        if (totalSupply() > maxTotalSupply()) {
            revert ERC7984TotalSupplyOverflow();
        }
    }

    function _update(address from, address to, euint64 amount) internal virtual override returns (euint64) {
        if (from == address(0)) {
            _checkConfidentialTotalSupply();
        }
        return super._update(from, to, amount);
    }

    function _unwrap(address from, address to, euint64 amount) internal virtual {
        require(to != address(0), ERC7984InvalidReceiver(to));
        require(from == msg.sender || isOperator(from, msg.sender), ERC7984UnauthorizedSpender(from, msg.sender));

        // try to burn, see how much we actually got
        euint64 burntAmount = _burn(from, amount);
        FHE.makePubliclyDecryptable(burntAmount);

        ERC7984ERC20WrapperStorage storage $ = _getERC7984ERC20WrapperStorage();
        assert($._unwrapRequests[burntAmount] == address(0));

        $._unwrapRequests[burntAmount] = to;

        emit UnwrapRequested(to, burntAmount);
    }

    function _fallbackUnderlyingDecimals() internal pure virtual returns (uint8) {
        return 18;
    }

    function _maxDecimals() internal pure virtual returns (uint8) {
        return 6;
    }

    function _tryGetAssetDecimals(IERC20 asset_) private view returns (uint8 assetDecimals) {
        (bool success, bytes memory encodedDecimals) = address(asset_).staticcall(
            abi.encodeCall(IERC20Metadata.decimals, ())
        );
        if (success && encodedDecimals.length == 32) {
            return abi.decode(encodedDecimals, (uint8));
        }
        return _fallbackUnderlyingDecimals();
    }
}

/// @notice Concrete confidential ERC-20 wrapper — UUPS upgradeable, Ownable.
contract ConfidentialWrapper is
    ERC7984ERC20WrapperUpgradeable,
    ZamaEthereumConfigUpgradeable,
    UUPSUpgradeable,
    Ownable2StepUpgradeable
{
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory name_,
        string memory symbol_,
        string memory contractURI_,
        IERC20 underlying_,
        address owner_
    ) public initializer {
        __ERC7984_init(name_, symbol_, contractURI_);
        __ERC7984ERC20Wrapper_init(underlying_);
        __ZamaEthereumConfig_init();
        __Ownable_init(owner_);
        __Ownable2Step_init();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
