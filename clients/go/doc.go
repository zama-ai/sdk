// Package zama is a client for the Zama SDK daemon over a Unix socket. Close
// each SDKContext before its Client; canceling an operation cannot undo a
// completed transaction or storage write.
package zama
