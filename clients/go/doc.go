// Package zama is a client for the Zama SDK daemon over a Unix socket. Close
// each SDKContext before its Client; canceling an operation cannot undo a
// completed transaction or storage write.
//
// The daemon protocol is beta: minor releases can break the wire contract and this API.
package zama
