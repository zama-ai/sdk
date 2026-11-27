//go:build !linux && !darwin

package zama

import "errors"

// Without the peer's UID the check cannot run, so refuse the connection.
func fdPeerUID(int) (uint32, error) {
	return 0, errors.New("daemon socket peer check is not supported on this platform")
}
