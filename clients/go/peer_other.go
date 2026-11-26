//go:build !linux && !darwin

package zama

import "errors"

// Without the peer's UID the check cannot run, so the connection is refused
// rather than kept unchecked.
func fdPeerUID(int) (uint32, error) {
	return 0, errors.New("daemon socket peer check is not supported on this platform")
}
