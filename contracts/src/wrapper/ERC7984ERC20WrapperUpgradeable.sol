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
import {IDeploymentCoordinator} from "../interfaces/IDeploymentCoordinator.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {FeeManager} from "../admin/FeeManager.sol";
import {AdminProvider} from "../admin/AdminProvider.sol";
import {SanctionsList} from "../admin/SanctionsList.sol";
import {IWrapperReceiver} from "../interfaces/IWrapperReceiver.sol";

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

contract ConfidentialWrapperOld is
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


/// @custom:security-contact contact@zaiffer.org
abstract contract RegulatedERC7984ERC20WrapperUpgradeable is
    ERC7984ERC20WrapperUpgradeable,
    Ownable2StepUpgradeable
{
    /**
     * @notice Returned when an address is sanctioned.
     */
    error SanctionedAddress(address account);

    /// @custom:storage-location erc7201:zaiffer.storage.RegulatedERC7984ERC20WrapperUpgradeable
    struct RegulatedERC7984ERC20WrapperStorage {
        IDeploymentCoordinator _deploymentCoordinator;
        address _tokenRegulator;
        uint256 _nextTxId;
    }

    event TransferInfo(address indexed from, address indexed to, euint64 encryptedAmount, uint256 txId);
    event MintInfo(address indexed to, uint64 amount, uint256 txId);
    event BurnInfo(address indexed from, euint64 amount, uint256 txId);
    event TokenRegulatorUpdated(address indexed oldRegulator, address indexed newRegulator);

    // keccak256(abi.encode(uint256(keccak256("zaiffer.storage.RegulatedERC7984ERC20Wrapper")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant RegulatedERC7984ERC20WrapperStorageLocation =
        0xc7e2ca22e3f343d5d9ec9e982687c40c163fcb30775b04d160e6de1b056bd000;

    function _getRegulatedERC7984ERC20WrapperStorage() internal pure returns (RegulatedERC7984ERC20WrapperStorage storage $) {
        assembly {
            $.slot := RegulatedERC7984ERC20WrapperStorageLocation
        }
    }

    function __RegulatedERC7984ERC20Wrapper_init(
        string memory name_,
        string memory symbol_,
        string memory contractURI_,
        IERC20 underlying_,
        address owner_,
        IDeploymentCoordinator deploymentCoordinator_
    ) internal onlyInitializing {
        __ERC7984_init(name_, symbol_, contractURI_);
        __ERC7984ERC20Wrapper_init(underlying_);
        __Ownable_init(owner_);
        __Ownable2Step_init();
        __RegulatedERC7984ERC20Wrapper_init_unchained(deploymentCoordinator_);
    }

    function __RegulatedERC7984ERC20Wrapper_init_unchained(
        IDeploymentCoordinator deploymentCoordinator_
    ) internal onlyInitializing {
        RegulatedERC7984ERC20WrapperStorage storage $ = _getRegulatedERC7984ERC20WrapperStorage();
        $._deploymentCoordinator = deploymentCoordinator_;
        $._nextTxId = 1;

       _setTotalSupply(FHE.asEuint64(0));
    }

    function _incrementNextTxId() internal {
        RegulatedERC7984ERC20WrapperStorage storage $ = _getRegulatedERC7984ERC20WrapperStorage();
        $._nextTxId += 1;
    }

    function nextTxId() public view returns (uint256) {
        RegulatedERC7984ERC20WrapperStorage storage $ = _getRegulatedERC7984ERC20WrapperStorage();
        return $._nextTxId;
    }

    function deploymentCoordinator() public view virtual returns (IDeploymentCoordinator) {
        RegulatedERC7984ERC20WrapperStorage storage $ = _getRegulatedERC7984ERC20WrapperStorage();

        return $._deploymentCoordinator;
    }

    function adminProvider() public view virtual returns (AdminProvider) {
        RegulatedERC7984ERC20WrapperStorage storage $ = _getRegulatedERC7984ERC20WrapperStorage();

        return $._deploymentCoordinator.adminProvider();
    }

    function regulator() public view virtual returns (address) {
        return adminProvider().regulator();
    }

    function tokenRegulator() public view virtual returns (address) {
        RegulatedERC7984ERC20WrapperStorage storage $ = _getRegulatedERC7984ERC20WrapperStorage();

        return $._tokenRegulator;
    }

    function setTokenRegulator(address newRegulator) public virtual onlyOwner {
        RegulatedERC7984ERC20WrapperStorage storage $ = _getRegulatedERC7984ERC20WrapperStorage();
        address oldRegulator = $._tokenRegulator;
        $._tokenRegulator = newRegulator;

        emit TokenRegulatorUpdated(oldRegulator, newRegulator);
    }

    /**
     * @notice Check if an address is sanctioned.
     * @param account The address to check.
     */
    function _checkSanctions(SanctionsList sanctionsList, address account) internal view {
        if (sanctionsList.isSanctioned(account)) {
            revert SanctionedAddress(account);
        }
    }

    // Overrides
    function _setTotalSupply(euint64 totalSupply) internal virtual override {
        ERC7984Storage storage $ = _getERC7984Storage();
        $._totalSupply = totalSupply;
        FHE.allowThis($._totalSupply);
        FHE.makePubliclyDecryptable($._totalSupply);
    }

    function _update(address from, address to, euint64 amount) internal override returns (euint64 transferred) {
        RegulatedERC7984ERC20WrapperStorage storage $ = _getRegulatedERC7984ERC20WrapperStorage();

        transferred = super._update(from, to, amount);

        SanctionsList sanctionsList = adminProvider().sanctionsList();
        address cachedRegulator = regulator();
        address cachedTokenRegulator = tokenRegulator();

        // Check sanctions on msg.sender (operator)
        address sender = _msgSender();
        if (sender != from) {
            _checkSanctions(sanctionsList, sender);
        }

        // Grant admin access to transferred amount and updated balances
        if (from != address(0)) {
            _checkSanctions(sanctionsList, from);
            euint64 fromBalance = confidentialBalanceOf(from);
            FHE.allow(fromBalance, cachedRegulator);
            if (cachedTokenRegulator != address(0)) {
                FHE.allow(fromBalance, cachedTokenRegulator);
            }
        }
        if (to != address(0)) {
            _checkSanctions(sanctionsList, to);
            euint64 toBalance = confidentialBalanceOf(to);
            FHE.allow(toBalance, cachedRegulator);
            if (cachedTokenRegulator != address(0)) {
                FHE.allow(toBalance, cachedTokenRegulator);
            }
        }

        FHE.allow(transferred, cachedRegulator);
        if (cachedTokenRegulator != address(0)) {
            FHE.allow(transferred, cachedTokenRegulator);
        }

        emit TransferInfo(from, to, transferred, $._nextTxId);

        _incrementNextTxId();

        return transferred;
    }

    function totalSupply() public view virtual override returns (uint256) {
        if (underlying() == address(0)) {
            return address(this).balance / rate();
        }
        return IERC20(underlying()).balanceOf(address(this)) / rate();
    }
}


abstract contract RegulatedERC7984ERC20WrapperWithFeesUpgradeable is
    RegulatedERC7984ERC20WrapperUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    struct ReceiverEntry {
        address to;
        address refund;
        bytes callbackData;
        euint64 expectedBurnAmount;
        euint64 actualBurnAmount;
        uint64 committedFeeBasisPoints;
        address from;
    }

    struct FinalizeSuccessParams {
        euint64 burntAmountHandle;
        uint64 actualBurnAmount;
        ReceiverEntry receiver;
    }

    event Wrapped(uint64 mintAmount, uint256 amountIn, uint256 feeAmount, address indexed to_, uint256 indexed mintTxId);
    event UnwrappedFinalized(euint64 indexed burntAmountHandle, bool finalizeSuccess, bool feeTransferSuccess, uint64 burnAmount, uint256 unwrapAmount, uint256 feeAmount, uint256 indexed nextTxId);
    event UnwrappedStarted(
        bool returnVal,
        uint256 indexed requestId,
        uint256 indexed txId,
        address indexed to,
        address refund,
        euint64 requestedAmount,
        euint64 burnAmount
    );
    event FinalizeUnwrapOperatorSet(address indexed holder, address indexed operator, uint48 until);

    /// @dev The caller is not authorized to finalize this unwrap request
    error UnauthorizedFinalizeUnwrapCaller(euint64 burntAmount, address caller, address unwrapInitiator);
    error IncorrectEthAmount();
    error EthFeeTransferFailed();
    error CannotReceiveEthForTokenWrap();
    error WrapperBalanceExceedsMaxSupply();

    /// @custom:storage-location erc7201:zaiffer.storage.RegulatedERC7984ERC20WrapperWithFeesUpgradeable
    struct RegulatedERC7984ERC20WrapperWithFeesStorage {
        mapping(address holder => mapping(address operator => uint48 validUntilTimestamp)) _finalizeUnwrapOperators;
        uint256 _totalSupply;
        mapping(euint64 unwrapAmount => ReceiverEntry receiverEntry) _receivers;
        uint256 _requestId;
    }

    // keccak256(abi.encode(uint256(keccak256("zaiffer.storage.RegulatedERC7984ERC20WrapperWithFees")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant RegulatedERC7984ERC20WrapperWithFeesStorageLocation =
        0x8e48b2eccdccfd5aed2e746835ae0c0e6585de2e8733f2379a70d0021d9a8c00;

    function _getRegulatedERC7984ERC20WrapperWithFeesStorage() internal pure returns (RegulatedERC7984ERC20WrapperWithFeesStorage storage $) {
        assembly {
            $.slot := RegulatedERC7984ERC20WrapperWithFeesStorageLocation
        }
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function __RegulatedERC7984ERC20WrapperWithFees_init(
        string memory name_,
        string memory symbol_,
        string memory contractURI_,
        IERC20 underlying_,
        address owner_,
        IDeploymentCoordinator deploymentCoordinator_
    ) internal onlyInitializing {
        __RegulatedERC7984ERC20Wrapper_init(name_, symbol_, contractURI_, underlying_, owner_, deploymentCoordinator_);
        __ReentrancyGuard_init();
        __RegulatedERC7984ERC20WrapperWithFees_init_unchained();
    }

    function __RegulatedERC7984ERC20WrapperWithFees_init_unchained() internal onlyInitializing {}

    function totalSupply() public view virtual override returns (uint256) {
        RegulatedERC7984ERC20WrapperWithFeesStorage storage $ = _getRegulatedERC7984ERC20WrapperWithFeesStorage();
        return $._totalSupply;
    }

    /// @inheritdoc IERC7984ERC20Wrapper
    /// @dev Reverts when underlying is ETH, use {wrapEth} which is payable instead.
    function wrap(address to, uint256 amount) public virtual override nonReentrant {
        // TODO: specify error
        require(underlying() != address(0), IncorrectEthAmount());

        _wrap(to, amount);
    }

    /// @dev Variant of {wrap} that is payable and wraps ETH.
    function wrapETH(address to, uint256 amount) public payable virtual nonReentrant {
        // TODO: specify error
        require(underlying() == address(0), IncorrectEthAmount());

        _wrap(to, amount);
    }

    function _getFeeRecipient() private view returns (address) {
        FeeManager feeManager = adminProvider().feeManager();
        return feeManager.getFeeRecipient();
    }

    //////
    ////// UNWRAP
    //////

    function _getWrapFee(uint256 amount_, address to) private view returns (uint256) {
        FeeManager feeManager = adminProvider().feeManager();
        return feeManager.getWrapFee(amount_, msg.sender, to);
    }

    function _wrap(address to_, uint256 amount_) internal {
        uint256 mintTxId = nextTxId();
        uint64 mintAmount;
        uint256 actualFeeReceived;

        uint256 baseFee = _getWrapFee(amount_, to_);
        uint256 rate = rate();
        uint256 baseAmount = amount_ - baseFee;
        uint256 wrapDust = baseAmount % rate;
        uint256 transferAmount = baseAmount - wrapDust;  // == baseAmount / rate * rate
        uint256 totalFee = amount_ - transferAmount;

        if (underlying() == address(0)) {
            require(msg.value == amount_, IncorrectEthAmount());
            (mintAmount, actualFeeReceived) = _processETHDeposit(transferAmount, totalFee);
        } else {
            (mintAmount, actualFeeReceived) = _processERC20Deposit(transferAmount, totalFee);
        }

        _mintWrappedTokens(to_, mintAmount);
        emit Wrapped(mintAmount, amount_, actualFeeReceived, to_, mintTxId);
    }

    function _processETHDeposit(uint256 transferAmount_, uint256 totalFee_) private returns (uint64 mintAmount, uint256 actualFeeReceived) {
        uint256 rate = rate();

        mintAmount = SafeCast.toUint64(transferAmount_ / rate);

        address feeRecipient = _getFeeRecipient();
        (bool ethTransferSuccess, ) = feeRecipient.call{value: totalFee_}("");
        if (!ethTransferSuccess) {
            revert EthFeeTransferFailed();
        }

        actualFeeReceived = totalFee_;
    }

    function _processERC20Deposit(uint256 transferAmount_, uint256 totalFee_) private returns (uint64 mintAmount, uint256 actualFeeReceived) {
        require(msg.value == 0, CannotReceiveEthForTokenWrap());

        uint256 rate = rate();
        address feeRecipient = _getFeeRecipient();

        // Transfer and track wrapper balance
        uint256 balanceBefore = IERC20(underlying()).balanceOf(address(this));
        IERC20(underlying()).safeTransferFrom(msg.sender, address(this), transferAmount_);
        uint256 balanceDifference = IERC20(underlying()).balanceOf(address(this)) - balanceBefore;

        mintAmount = SafeCast.toUint64(balanceDifference / rate);

        // Track fee recipient balance to emit accurate fee amount
        uint256 feeBalBefore = IERC20(underlying()).balanceOf(feeRecipient);

        // Transfer fee and track actual received
        IERC20(underlying()).safeTransferFrom(msg.sender, feeRecipient, totalFee_);

        // Transfer dust
        uint256 transferDust = balanceDifference % rate;
        if (transferDust > 0) {
            IERC20(underlying()).safeTransfer(feeRecipient, transferDust);
        }

        actualFeeReceived = IERC20(underlying()).balanceOf(feeRecipient) - feeBalBefore;
    }

    //////
    ////// UNWRAP
    //////

    function requestId() public view returns (uint256) {
        RegulatedERC7984ERC20WrapperWithFeesStorage storage $ = _getRegulatedERC7984ERC20WrapperWithFeesStorage();
        return $._requestId;
    }

    function _getUnwrapFeeBasisPoints(address to) private view returns (uint64) {
        FeeManager feeManager = adminProvider().feeManager();
        return feeManager.getUnwrapFeeBasisPoints(msg.sender, to);
    }

    function _getUnwrapFee(uint64 amount_, uint64 basisPoints) private view returns (uint64) {
        FeeManager feeManager = adminProvider().feeManager();
        return feeManager.getFee(amount_, basisPoints);
    }

    function unwrap(address from, address to, euint64 amount) public virtual override {
        require(FHE.isAllowed(amount, msg.sender), ERC7984UnauthorizedUseOfEncryptedAmount(amount, msg.sender));
        _unwrap(from, to, amount, to, new bytes(0));
    }

    function unwrap(
        address from,
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) public virtual override {
        _unwrap(from, to, FHE.fromExternal(encryptedAmount, inputProof), to, new bytes(0));
    }

    function unwrapWithRefund(address from, address to, euint64 amount, address refund) public virtual {
        require(FHE.isAllowed(amount, msg.sender), ERC7984UnauthorizedUseOfEncryptedAmount(amount, msg.sender));
        _unwrap(from, to, amount, refund, new bytes(0));
    }

    function unwrapWithRefund(
        address from,
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof,
        address refund
    ) public virtual {
        _unwrap(from, to, FHE.fromExternal(encryptedAmount, inputProof), refund, new bytes(0));
    }

    function unwrapAndCall(address from, address to, euint64 amount, address refund, bytes memory unwrapCallbackData) public virtual {
        require(FHE.isAllowed(amount, msg.sender), ERC7984UnauthorizedUseOfEncryptedAmount(amount, msg.sender));
        _unwrap(from, to, amount, refund, unwrapCallbackData);
    }

    function unwrapAndCall(
        address from,
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof,
        address refund,
        bytes memory unwrapCallbackData
    ) public virtual {
        _unwrap(from, to, FHE.fromExternal(encryptedAmount, inputProof), refund, unwrapCallbackData);
    }

    function _unwrap(
        address from,
        address to,
        euint64 amount,
        address refund,
        bytes memory unwrapCallbackData
    ) internal virtual {
        require(FHE.isAllowed(amount, msg.sender), ERC7984UnauthorizedUseOfEncryptedAmount(amount, msg.sender));

        require(to != address(0), ERC7984InvalidReceiver(to));
        require(refund != address(0), ERC7984InvalidReceiver(refund));
        require(from == msg.sender || isOperator(from, msg.sender), ERC7984UnauthorizedSpender(from, msg.sender));

        _processUnwrap(from, to, refund, amount, unwrapCallbackData);
    }

    function _processUnwrap(
        address from,
        address to,
        address refund,
        euint64 amount,
        bytes memory unwrapCallbackData
    ) private {
        RegulatedERC7984ERC20WrapperWithFeesStorage storage $ = _getRegulatedERC7984ERC20WrapperWithFeesStorage();

        uint256 txId = nextTxId();
        euint64 actualBurnAmount = _burn(from, amount);

        FHE.makePubliclyDecryptable(amount);
        FHE.makePubliclyDecryptable(actualBurnAmount);

        $._receivers[actualBurnAmount] = ReceiverEntry({
            to: to,
            refund: refund,
            callbackData: unwrapCallbackData,
            expectedBurnAmount: amount,
            actualBurnAmount: actualBurnAmount,
            committedFeeBasisPoints: _getUnwrapFeeBasisPoints(to),
            from: from
        });

        emit UnwrapRequested(to, actualBurnAmount);

        $._requestId++;
    }

    function finalizeUnwrap(
        euint64 burntAmount,
        uint64 burntAmountCleartext,
        bytes calldata decryptionProof
    ) public virtual override {
        RegulatedERC7984ERC20WrapperWithFeesStorage storage $ = _getRegulatedERC7984ERC20WrapperWithFeesStorage();

        ReceiverEntry memory receiver = $._receivers[burntAmount];
        require(receiver.to != address(0), InvalidUnwrapRequest(burntAmount));

        // Permission check
        require(
            isFinalizeUnwrapOperator(receiver.from, msg.sender),
            UnauthorizedFinalizeUnwrapCaller(burntAmount, msg.sender, receiver.from)
        );

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = euint64.unwrap(burntAmount);

        bytes memory cleartexts = abi.encode(burntAmountCleartext);

        FHE.checkSignatures(handles, cleartexts, decryptionProof);

        delete $._receivers[burntAmount];

        $._totalSupply -= burntAmountCleartext;

        if (burntAmountCleartext > 0) {
            _finalizeSuccessfulUnwrap(FinalizeSuccessParams(burntAmount, burntAmountCleartext, receiver));
        } else {
            _finalizeFailedUnwrap(burntAmount, burntAmountCleartext, receiver);
        }
    }

    function _finalizeSuccessfulUnwrap(
        FinalizeSuccessParams memory params
    ) private returns (bool) {

        uint256 rate = rate();
        uint64 feeAmount64 = _getUnwrapFee(params.actualBurnAmount, params.receiver.committedFeeBasisPoints);
        uint256 feeAmount256 = feeAmount64 * rate;
        uint256 unwrapAmount = params.actualBurnAmount * rate - feeAmount256;
        address feeRecipient = _getFeeRecipient();

        // Transfer fee to fee recipient
        bool feeSuccess = _transferUnderlying(feeRecipient, feeAmount256);

        if (feeSuccess == false) {
            unwrapAmount += feeAmount256;
            feeAmount256 = 0;
        }

        // Transfer principal to receiver
        bool unwrapSuccess = _transferUnderlying(params.receiver.to, unwrapAmount);

        // Reimbursement txId if unwrapSuccess is false
        uint256 mintTxId = nextTxId();

        if (unwrapSuccess == false) {
            unwrapAmount = 0;
            if (feeSuccess == false) {
                _mintWrappedTokens(params.receiver.refund, params.actualBurnAmount);
                feeAmount256 = 0;
            } else {
                uint64 reimbursementAmount = params.actualBurnAmount - feeAmount64;
                _mintWrappedTokens(params.receiver.refund, reimbursementAmount);
            }
        }

        emit UnwrappedFinalized(
            params.burntAmountHandle,
            unwrapSuccess,
            feeSuccess,
            params.actualBurnAmount,
            unwrapAmount,
            feeAmount256,
            mintTxId
        );

        emit UnwrapFinalized(params.receiver.to, params.burntAmountHandle, uint64(unwrapAmount / rate));

        return _executeWrapperReceiverCallback(params.receiver, unwrapAmount, params.burntAmountHandle);
    }

    function _executeWrapperReceiverCallback(ReceiverEntry memory receiver, uint256 unwrapAmount, euint64 burntAmountHandle) internal returns (bool) {
        if (receiver.to.code.length > 0 && receiver.callbackData.length > 0) {
            return IWrapperReceiver(receiver.to).onUnwrapFinalizedReceived(msg.sender, unwrapAmount, burntAmountHandle, receiver.refund, receiver.callbackData);
        }
        return true;
    }

    function _finalizeFailedUnwrap(
        euint64 burntAmountHandle,
        uint64 actualBurnAmount,
        ReceiverEntry memory receiver
    ) private {
        // Reimbursement txId if actualBurnAmount > 0
        uint256 mintTxId = nextTxId();

        if (actualBurnAmount > 0) {
            _mintWrappedTokens(receiver.to, actualBurnAmount);
        }
        emit UnwrappedFinalized(burntAmountHandle, false, false, actualBurnAmount, 0, 0, mintTxId);
        emit UnwrapFinalized(receiver.to, burntAmountHandle, 0);
    }

    function _mintWrappedTokens(address to_, uint64 amount_) private {
        RegulatedERC7984ERC20WrapperWithFeesStorage storage $ = _getRegulatedERC7984ERC20WrapperWithFeesStorage();

        $._totalSupply += amount_;
        _mint(to_, FHE.asEuint64(amount_));
    }

    function _transferUnderlying(address to, uint256 amount) internal returns (bool success) {
        if (underlying() == address(0)) {
            (success, ) = to.call{value: amount}("");
        } else {
            try IERC20(underlying()).transfer(to, amount) returns (bool result) {
                success = result;
            } catch {
                success = false;
            }
        }
    }

    function isFinalizeUnwrapOperator(address holder, address operator) public view virtual returns (bool) {
        RegulatedERC7984ERC20WrapperWithFeesStorage storage $ = _getRegulatedERC7984ERC20WrapperWithFeesStorage();
        return holder == operator || block.timestamp <= $._finalizeUnwrapOperators[holder][operator];
    }

    function setFinalizeUnwrapOperator(address operator, uint48 until) public virtual {
        _setFinalizeUnwrapOperator(msg.sender, operator, until);
    }

    function _setFinalizeUnwrapOperator(address holder, address operator, uint48 until) internal virtual {
        RegulatedERC7984ERC20WrapperWithFeesStorage storage $ = _getRegulatedERC7984ERC20WrapperWithFeesStorage();
        $._finalizeUnwrapOperators[holder][operator] = until;
        emit FinalizeUnwrapOperatorSet(holder, operator, until);
    }

    function getReceiverEntry(euint64 burntAmount) public view returns (ReceiverEntry memory) {
        RegulatedERC7984ERC20WrapperWithFeesStorage storage $ = _getRegulatedERC7984ERC20WrapperWithFeesStorage();
        return $._receivers[burntAmount];
    }

}


contract ConfidentialWrapper is
    ZamaEthereumConfigUpgradeable,
    RegulatedERC7984ERC20WrapperWithFeesUpgradeable,
    UUPSUpgradeable
{
    error ZeroAddressDeploymentCoordinator();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory name_,
        string memory symbol_,
        string memory contractURI_,
        IERC20 underlying_,
        address owner_,
        IDeploymentCoordinator deploymentCoordinator_
    ) public initializer {
        require(address(deploymentCoordinator_) != address(0), ZeroAddressDeploymentCoordinator());

        __ZamaEthereumConfig_init();
        __RegulatedERC7984ERC20WrapperWithFees_init(name_, symbol_, contractURI_, underlying_, owner_, deploymentCoordinator_);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
