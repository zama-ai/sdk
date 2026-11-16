// Package zama is a client for the Zama SDK daemon over a Unix socket. Close
// each SDKContext before its Client; canceling an operation cannot undo a
// completed transaction or storage write.
//
// The daemon and its Go and Rust clients are experimental. The wire protocol can
// change between minor versions, so upgrade the daemon image and the clients together.
// Run the client and daemon at exactly matching versions.
package zama
