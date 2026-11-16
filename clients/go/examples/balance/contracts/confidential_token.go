// Code generated - DO NOT EDIT.
// This file is a generated binding and any manual changes will be lost.

package contracts

import (
	"context"
	"errors"
	"math/big"
	"strings"
	"time"

	ethereum "github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/event"
)

// Reference imports to suppress errors if they are not otherwise used.
var (
	_ = errors.New
	_ = big.NewInt
	_ = strings.NewReader
	_ = ethereum.NotFound
	_ = bind.Bind
	_ = common.Big1
	_ = types.BloomLookup
	_ = event.NewSubscription
	_ = abi.ConvertType
	_ = time.Tick
	_ = context.Background
)

// ConfidentialTokenMetaData contains all meta data concerning the ConfidentialToken contract.
var ConfidentialTokenMetaData = &bind.MetaData{
	ABI: "[{\"type\":\"function\",\"name\":\"name\",\"inputs\":[],\"outputs\":[{\"type\":\"string\"}],\"stateMutability\":\"view\"},{\"type\":\"function\",\"name\":\"confidentialBalanceOf\",\"inputs\":[{\"name\":\"account\",\"type\":\"address\"}],\"outputs\":[{\"type\":\"bytes32\"}],\"stateMutability\":\"view\"}]",
}

// ConfidentialTokenABI is the input ABI used to generate the binding from.
// Deprecated: Use ConfidentialTokenMetaData.ABI instead.
var ConfidentialTokenABI = ConfidentialTokenMetaData.ABI

// ConfidentialToken is an auto generated Go binding around an Ethereum contract.
type ConfidentialToken struct {
	ConfidentialTokenCaller     // Read-only binding to the contract
	ConfidentialTokenTransactor // Write-only binding to the contract
	ConfidentialTokenFilterer   // Log filterer for contract events
}

// ConfidentialTokenCaller is an auto generated read-only Go binding around an Ethereum contract.
type ConfidentialTokenCaller struct {
	contract *bind.BoundContract // Generic contract wrapper for the low level calls
}

// ConfidentialTokenTransactor is an auto generated write-only Go binding around an Ethereum contract.
type ConfidentialTokenTransactor struct {
	contract *bind.BoundContract // Generic contract wrapper for the low level calls
}

// ConfidentialTokenFilterer is an auto generated log filtering Go binding around an Ethereum contract events.
type ConfidentialTokenFilterer struct {
	contract *bind.BoundContract // Generic contract wrapper for the low level calls
}

// ConfidentialTokenSession is an auto generated Go binding around an Ethereum contract,
// with pre-set call and transact options.
type ConfidentialTokenSession struct {
	Contract     *ConfidentialToken // Generic contract binding to set the session for
	CallOpts     bind.CallOpts      // Call options to use throughout this session
	TransactOpts bind.TransactOpts  // Transaction auth options to use throughout this session
}

// ConfidentialTokenCallerSession is an auto generated read-only Go binding around an Ethereum contract,
// with pre-set call options.
type ConfidentialTokenCallerSession struct {
	Contract *ConfidentialTokenCaller // Generic contract caller binding to set the session for
	CallOpts bind.CallOpts            // Call options to use throughout this session
}

// ConfidentialTokenTransactorSession is an auto generated write-only Go binding around an Ethereum contract,
// with pre-set transact options.
type ConfidentialTokenTransactorSession struct {
	Contract     *ConfidentialTokenTransactor // Generic contract transactor binding to set the session for
	TransactOpts bind.TransactOpts            // Transaction auth options to use throughout this session
}

// ConfidentialTokenRaw is an auto generated low-level Go binding around an Ethereum contract.
type ConfidentialTokenRaw struct {
	Contract *ConfidentialToken // Generic contract binding to access the raw methods on
}

// ConfidentialTokenCallerRaw is an auto generated low-level read-only Go binding around an Ethereum contract.
type ConfidentialTokenCallerRaw struct {
	Contract *ConfidentialTokenCaller // Generic read-only contract binding to access the raw methods on
}

// ConfidentialTokenTransactorRaw is an auto generated low-level write-only Go binding around an Ethereum contract.
type ConfidentialTokenTransactorRaw struct {
	Contract *ConfidentialTokenTransactor // Generic write-only contract binding to access the raw methods on
}

// NewConfidentialToken creates a new instance of ConfidentialToken, bound to a specific deployed contract.
func NewConfidentialToken(address common.Address, backend bind.ContractBackend) (*ConfidentialToken, error) {
	contract, err := bindConfidentialToken(address, backend, backend, backend)
	if err != nil {
		return nil, err
	}
	return &ConfidentialToken{ConfidentialTokenCaller: ConfidentialTokenCaller{contract: contract}, ConfidentialTokenTransactor: ConfidentialTokenTransactor{contract: contract}, ConfidentialTokenFilterer: ConfidentialTokenFilterer{contract: contract}}, nil
}

// NewConfidentialTokenCaller creates a new read-only instance of ConfidentialToken, bound to a specific deployed contract.
func NewConfidentialTokenCaller(address common.Address, caller bind.ContractCaller) (*ConfidentialTokenCaller, error) {
	contract, err := bindConfidentialToken(address, caller, nil, nil)
	if err != nil {
		return nil, err
	}
	return &ConfidentialTokenCaller{contract: contract}, nil
}

// NewConfidentialTokenTransactor creates a new write-only instance of ConfidentialToken, bound to a specific deployed contract.
func NewConfidentialTokenTransactor(address common.Address, transactor bind.ContractTransactor) (*ConfidentialTokenTransactor, error) {
	contract, err := bindConfidentialToken(address, nil, transactor, nil)
	if err != nil {
		return nil, err
	}
	return &ConfidentialTokenTransactor{contract: contract}, nil
}

// NewConfidentialTokenFilterer creates a new log filterer instance of ConfidentialToken, bound to a specific deployed contract.
func NewConfidentialTokenFilterer(address common.Address, filterer bind.ContractFilterer) (*ConfidentialTokenFilterer, error) {
	contract, err := bindConfidentialToken(address, nil, nil, filterer)
	if err != nil {
		return nil, err
	}
	return &ConfidentialTokenFilterer{contract: contract}, nil
}

// bindConfidentialToken binds a generic wrapper to an already deployed contract.
func bindConfidentialToken(address common.Address, caller bind.ContractCaller, transactor bind.ContractTransactor, filterer bind.ContractFilterer) (*bind.BoundContract, error) {
	parsed, err := ConfidentialTokenMetaData.GetAbi()
	if err != nil {
		return nil, err
	}
	return bind.NewBoundContract(address, *parsed, caller, transactor, filterer), nil
}

// Call invokes the (constant) contract method with params as input values and
// sets the output to result. The result type might be a single field for simple
// returns, a slice of interfaces for anonymous returns and a struct for named
// returns.
func (_ConfidentialToken *ConfidentialTokenRaw) Call(opts *bind.CallOpts, result *[]interface{}, method string, params ...interface{}) error {
	return _ConfidentialToken.Contract.ConfidentialTokenCaller.contract.Call(opts, result, method, params...)
}

// Transfer initiates a plain transaction to move funds to the contract, calling
// its default method if one is available.
func (_ConfidentialToken *ConfidentialTokenRaw) Transfer(opts *bind.TransactOpts) (*types.Transaction, error) {
	return _ConfidentialToken.Contract.ConfidentialTokenTransactor.contract.Transfer(opts)
}

// Transact invokes the (paid) contract method with params as input values.
func (_ConfidentialToken *ConfidentialTokenRaw) Transact(opts *bind.TransactOpts, method string, params ...interface{}) (*types.Transaction, error) {
	return _ConfidentialToken.Contract.ConfidentialTokenTransactor.contract.Transact(opts, method, params...)
}

// Call invokes the (constant) contract method with params as input values and
// sets the output to result. The result type might be a single field for simple
// returns, a slice of interfaces for anonymous returns and a struct for named
// returns.
func (_ConfidentialToken *ConfidentialTokenCallerRaw) Call(opts *bind.CallOpts, result *[]interface{}, method string, params ...interface{}) error {
	return _ConfidentialToken.Contract.contract.Call(opts, result, method, params...)
}

// Transfer initiates a plain transaction to move funds to the contract, calling
// its default method if one is available.
func (_ConfidentialToken *ConfidentialTokenTransactorRaw) Transfer(opts *bind.TransactOpts) (*types.Transaction, error) {
	return _ConfidentialToken.Contract.contract.Transfer(opts)
}

// Transact invokes the (paid) contract method with params as input values.
func (_ConfidentialToken *ConfidentialTokenTransactorRaw) Transact(opts *bind.TransactOpts, method string, params ...interface{}) (*types.Transaction, error) {
	return _ConfidentialToken.Contract.contract.Transact(opts, method, params...)
}

// ConfidentialBalanceOf is a free data retrieval call binding the contract method 0x344ff101.
//
// Solidity: function confidentialBalanceOf(address account) view returns(bytes32)
func (_ConfidentialToken *ConfidentialTokenCaller) ConfidentialBalanceOf(opts *bind.CallOpts, account common.Address) ([32]byte, error) {
	var out []interface{}
	err := _ConfidentialToken.contract.Call(opts, &out, "confidentialBalanceOf", account)

	if err != nil {
		return *new([32]byte), err
	}

	out0 := *abi.ConvertType(out[0], new([32]byte)).(*[32]byte)

	return out0, err

}

// ConfidentialBalanceOf is a free data retrieval call binding the contract method 0x344ff101.
//
// Solidity: function confidentialBalanceOf(address account) view returns(bytes32)
func (_ConfidentialToken *ConfidentialTokenSession) ConfidentialBalanceOf(account common.Address) ([32]byte, error) {
	return _ConfidentialToken.Contract.ConfidentialBalanceOf(&_ConfidentialToken.CallOpts, account)
}

// ConfidentialBalanceOf is a free data retrieval call binding the contract method 0x344ff101.
//
// Solidity: function confidentialBalanceOf(address account) view returns(bytes32)
func (_ConfidentialToken *ConfidentialTokenCallerSession) ConfidentialBalanceOf(account common.Address) ([32]byte, error) {
	return _ConfidentialToken.Contract.ConfidentialBalanceOf(&_ConfidentialToken.CallOpts, account)
}

// Name is a free data retrieval call binding the contract method 0x06fdde03.
//
// Solidity: function name() view returns(string)
func (_ConfidentialToken *ConfidentialTokenCaller) Name(opts *bind.CallOpts) (string, error) {
	var out []interface{}
	err := _ConfidentialToken.contract.Call(opts, &out, "name")

	if err != nil {
		return *new(string), err
	}

	out0 := *abi.ConvertType(out[0], new(string)).(*string)

	return out0, err

}

// Name is a free data retrieval call binding the contract method 0x06fdde03.
//
// Solidity: function name() view returns(string)
func (_ConfidentialToken *ConfidentialTokenSession) Name() (string, error) {
	return _ConfidentialToken.Contract.Name(&_ConfidentialToken.CallOpts)
}

// Name is a free data retrieval call binding the contract method 0x06fdde03.
//
// Solidity: function name() view returns(string)
func (_ConfidentialToken *ConfidentialTokenCallerSession) Name() (string, error) {
	return _ConfidentialToken.Contract.Name(&_ConfidentialToken.CallOpts)
}
